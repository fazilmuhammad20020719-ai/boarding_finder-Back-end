const bcrypt = require("bcryptjs");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const { query } = require("../../db");
const { validatePassword } = require("../../utils/validators");
const { issueSession, revokeSession, revokeAllSessions } = require("../../utils/tokens");
const { uploadFilesToDrive } = require("../../utils/rcloneUpload");

// ─────────────────────────────────────────────────────────────
// Account settings for every role: notification + privacy preferences,
// change password, delete account, profile picture.
// ─────────────────────────────────────────────────────────────

// Preference keys each role may set. Anything else in the request is ignored.
const NOTIFICATION_KEYS = {
  student: ["bookingUpdates", "maintenance", "announcements"],
  owner: ["newBookings", "maintenance", "reviews", "announcements"],
  admin: ["verifications", "newListings", "reports"],
};
const PRIVACY_KEYS = {
  student: ["profileVisible"],
  owner: ["showPhone"],
  admin: [],
};

const pickBooleans = (input, keys) => {
  const out = {};
  for (const key of keys) {
    if (typeof input?.[key] === "boolean") out[key] = input[key];
  }
  return out;
};

// PUT /api/auth/preferences  { notifications: {...}, privacy: {...} }
const updatePreferences = async (req, res) => {
  try {
    const role = req.user.role in NOTIFICATION_KEYS ? req.user.role : "student";
    const notifications = pickBooleans(req.body.notifications, NOTIFICATION_KEYS[role]);
    const privacy = pickBooleans(req.body.privacy, PRIVACY_KEYS[role]);

    const result = await query(
      `UPDATE users
       SET notification_prefs = COALESCE(notification_prefs, '{}'::jsonb) || $1::jsonb,
           privacy_prefs      = COALESCE(privacy_prefs, '{}'::jsonb) || $2::jsonb,
           updated_at = NOW()
       WHERE id = $3
       RETURNING notification_prefs, privacy_prefs`,
      [JSON.stringify(notifications), JSON.stringify(privacy), req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "User not found." });

    return res.status(200).json({ message: "Preferences saved.", ...result.rows[0] });
  } catch (err) {
    console.error("Update preferences error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

// POST /api/auth/change-password  { currentPassword, newPassword }
// Signs out every other session, keeps this one signed in.
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || typeof currentPassword !== "string") {
      return res.status(400).json({ message: "Please enter your current password." });
    }
    const check = validatePassword(newPassword);
    if (!check.valid) return res.status(400).json({ message: check.message });

    const result = await query("SELECT id, email, role, password_hash FROM users WHERE id = $1", [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ message: "User not found." });

    const matches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!matches) return res.status(400).json({ message: "Your current password is incorrect." });

    if (await bcrypt.compare(newPassword, user.password_hash)) {
      return res.status(400).json({ message: "Your new password must be different from the current one." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await query(
      `UPDATE users SET password_hash = $1, reset_token_hash = NULL, reset_token_expires = NULL, updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    // Sign out all devices, then start a fresh session for this one
    await revokeAllSessions(user.id);
    const accessToken = await issueSession(res, user);

    return res.status(200).json({
      message: "Password changed. Other devices have been signed out.",
      token: accessToken,
    });
  } catch (err) {
    console.error("Change password error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

// POST /api/auth/delete-account  { password, confirm: "DELETE" }
// Closes the account: cancels pending bookings, takes the owner's listings
// offline, blocks sign-in and signs out everywhere. Booking and payment
// history is kept for the other party's records.
const deleteAccount = async (req, res) => {
  try {
    const { password, confirm } = req.body;
    if (req.user.role === "admin") {
      return res.status(403).json({ message: "Admin accounts can't be deleted from Settings." });
    }
    if (confirm !== "DELETE") {
      return res.status(400).json({ message: 'Type DELETE to confirm.' });
    }

    const result = await query("SELECT id, role, password_hash FROM users WHERE id = $1", [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ message: "User not found." });

    const matches = await bcrypt.compare(String(password || ""), user.password_hash);
    if (!matches) return res.status(400).json({ message: "Your password is incorrect." });

    // Pending requests can't be completed any more
    await query(
      `UPDATE bookings SET status = 'cancelled', updated_at = NOW()
       WHERE status = 'pending' AND (seeker_id = $1 OR owner_id = $1)`,
      [user.id]
    );

    if (user.role === "owner") {
      await query("UPDATE listings SET is_paused = TRUE WHERE owner_id = $1", [user.id]);
    }

    // status_changed_by = the user themself marks a self-deleted account
    await query(
      `UPDATE users
       SET account_status = 'removed', status_changed_by = $1, status_changed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    await revokeAllSessions(user.id);
    await revokeSession(req, res); // clears the refresh cookie on this device

    return res.status(200).json({ message: "Your account has been deleted." });
  } catch (err) {
    console.error("Delete account error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

// ─── Profile picture ─────────────────────────
const AVATAR_REMOTE = process.env.RCLONE_AVATAR_REMOTE || "gdrive:BoardingFinder/avatars";
const UPLOAD_TEMP_DIR = process.env.UPLOAD_TEMP_DIR || "/tmp/boarding-uploads";

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(UPLOAD_TEMP_DIR)) fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
      cb(null, UPLOAD_TEMP_DIR);
    },
    // Final name/extension is assigned after magic-byte validation
    filename: (req, file, cb) => cb(null, `avatar_${req.user.id}_${crypto.randomUUID()}`),
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG and WebP images are allowed."));
  },
}).single("avatar");

// POST /api/auth/avatar  (multipart, field "avatar")
const uploadAvatar = (req, res) => {
  avatarUpload(req, res, async (err) => {
    if (err) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "Profile picture must be under 3MB." : err.message;
      return res.status(400).json({ message });
    }
    if (!req.file) return res.status(400).json({ message: "Please choose an image." });

    try {
      let urls;
      try {
        urls = await uploadFilesToDrive([req.file], AVATAR_REMOTE, UPLOAD_TEMP_DIR);
      } catch (uploadErr) {
        return res.status(uploadErr.status || 500).json({ message: uploadErr.message });
      }
      if (!urls.length) {
        return res.status(500).json({ message: "Upload failed. Is rclone configured on this server?" });
      }

      const result = await query(
        "UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING avatar_url",
        [urls[0], req.user.id]
      );
      return res.status(200).json({ message: "Profile picture updated.", avatar_url: result.rows[0].avatar_url });
    } catch (error) {
      console.error("Upload avatar error:", error.message);
      return res.status(500).json({ message: "Server error. Please try again." });
    } finally {
      if (req.file?.path) fs.rmSync(req.file.path, { force: true });
    }
  });
};

// DELETE /api/auth/avatar
const removeAvatar = async (req, res) => {
  try {
    await query("UPDATE users SET avatar_url = NULL, updated_at = NOW() WHERE id = $1", [req.user.id]);
    return res.status(200).json({ message: "Profile picture removed.", avatar_url: null });
  } catch (err) {
    console.error("Remove avatar error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

module.exports = {
  updatePreferences,
  changePassword,
  deleteAccount,
  uploadAvatar,
  removeAvatar,
  NOTIFICATION_KEYS,
  PRIVACY_KEYS,
};
