const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { query } = require("../../db");
const { validatePassword, validateEmail } = require("../../utils/validators");
const { sendPasswordResetEmail } = require("../../utils/sendOtp");
const { hashToken, revokeAllSessions } = require("../../utils/tokens");

const RESET_TTL_MINUTES = 30;
const GENERIC_MESSAGE = "If an account exists for that email, a password reset link has been sent.";

// POST /api/auth/forgot-password  { email }
// Always responds the same way so the endpoint can't be used to discover accounts.
const forgotPassword = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const check = validateEmail(email);
    if (!check.valid) {
      return res.status(400).json({ message: check.message });
    }

    const result = await query("SELECT id, name, email FROM users WHERE LOWER(email) = $1", [email]);
    const user = result.rows[0];

    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      await query(
        `UPDATE users
         SET reset_token_hash = $1, reset_token_expires = NOW() + ($2 || ' minutes')::interval
         WHERE id = $3`,
        [hashToken(token), String(RESET_TTL_MINUTES), user.id]
      );

      const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
      const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
      const sent = await sendPasswordResetEmail(user.email, resetUrl, user.name);
      if (!sent.success) {
        console.error("Password reset email failed for user", user.id, sent.error);
      }
    }

    return res.status(200).json({ message: GENERIC_MESSAGE });
  } catch (err) {
    console.error("Forgot password error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

// POST /api/auth/reset-password  { token, password }
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ message: "Reset link is invalid or has expired." });
    }

    const check = validatePassword(password);
    if (!check.valid) {
      return res.status(400).json({ message: check.message });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Single-use: the token is cleared in the same statement that consumes it
    const result = await query(
      `UPDATE users
       SET password_hash = $1, reset_token_hash = NULL, reset_token_expires = NULL, updated_at = NOW()
       WHERE reset_token_hash = $2 AND reset_token_expires > NOW()
       RETURNING id`,
      [passwordHash, hashToken(token)]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Reset link is invalid or has expired." });
    }

    // Sign out every existing session after a password change
    await revokeAllSessions(result.rows[0].id);

    return res.status(200).json({ message: "Password reset successfully. You can now sign in." });
  } catch (err) {
    console.error("Reset password error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

module.exports = { forgotPassword, resetPassword };
