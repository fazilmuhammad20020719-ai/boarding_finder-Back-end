const express = require("express");
const auth = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimiter");

const registerStudent = require("../controllers/auth/registerStudent");
const registerOwner = require("../controllers/auth/registerOwner");
const registerAdmin = require("../controllers/auth/registerAdmin");
const login = require("../controllers/auth/login");
const me = require("../controllers/auth/me");
const profile = require("../controllers/auth/profile");
const verifyOtp = require("../controllers/auth/verifyOtp");
const resendOtp = require("../controllers/auth/resendOtp");
const uploadVerificationDocs = require("../controllers/auth/uploadVerificationDocs");
const getVerificationDoc = require("../controllers/auth/getVerificationDoc");
const { refresh, logout } = require("../controllers/auth/session");
const { forgotPassword, resetPassword } = require("../controllers/auth/passwordReset");
const {
  updatePreferences, changePassword, deleteAccount, uploadAvatar, removeAvatar,
} = require("../controllers/auth/accountSettings");

const router = express.Router();

// ─── Rate Limiters ───────────────────────────
const otpVerifyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many OTP verification attempts. Please try again after 15 minutes.",
});

const otpResendLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,                      // stricter: 3 resends per window
  message: "Too many OTP resend requests. Please try again after 15 minutes.",
});

const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 10,                     // 10 registrations per hour per IP
  message: "Too many registration attempts. Please try again later.",
});

// ─────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────
router.post("/register", registerLimiter, (req, res, next) => {
  const { role } = req.body;
  if (role === "student") {
    return registerStudent(req, res, next);
  } else if (role === "owner") {
    return registerOwner(req, res, next);
  } else if (role === "admin") {
    // Only an existing, authenticated admin may create another admin account.
    return auth(req, res, () => {
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can create admin accounts." });
      }
      return registerAdmin(req, res, next);
    });
  } else {
    return res.status(400).json({ message: "Role must be 'student', 'owner', or 'admin'." });
  }
});

// ─────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────
// No attempt limit on login (by request).
router.post("/login", login);

// ─────────────────────────────────────────────
// POST /api/auth/refresh  — rotate refresh cookie, return new access token
// POST /api/auth/logout   — revoke refresh cookie
// ─────────────────────────────────────────────
const refreshLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: "Too many session refresh requests. Please try again later.",
});
router.post("/refresh", refreshLimiter, refresh);
router.post("/logout", logout);

// ─────────────────────────────────────────────
// POST /api/auth/forgot-password  — email a single-use reset link
// POST /api/auth/reset-password   — set a new password with that link
// ─────────────────────────────────────────────
const forgotLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: "Too many password reset requests. Please try again after 15 minutes.",
});
const resetLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many password reset attempts. Please try again after 15 minutes.",
});
router.post("/forgot-password", forgotLimiter, forgotPassword);
router.post("/reset-password", resetLimiter, resetPassword);

// ─────────────────────────────────────────────
// GET /api/auth/me  (Protected)
// ─────────────────────────────────────────────
router.get("/me", auth, me);

// ─────────────────────────────────────────────
// PUT /api/auth/profile  (Protected)
// ─────────────────────────────────────────────
router.put("/profile", auth, profile);

// ─────────────────────────────────────────────
// POST /api/auth/verify-otp  (Protected)
// ─────────────────────────────────────────────
router.post("/verify-otp", auth, otpVerifyLimiter, verifyOtp);

// ─────────────────────────────────────────────
// POST /api/auth/resend-otp  (Protected)
// ─────────────────────────────────────────────
router.post("/resend-otp", auth, otpResendLimiter, resendOtp);

// ─────────────────────────────────────────────
// POST /api/auth/upload-verification-docs (Protected)
// ─────────────────────────────────────────────
router.post("/upload-verification-docs", auth, uploadVerificationDocs);

// ─────────────────────────────────────────────
// GET /api/auth/verification-docs/:index (Protected — own documents only)
// ─────────────────────────────────────────────
router.get("/verification-docs/:index", auth, getVerificationDoc);

// ─────────────────────────────────────────────
// Account settings (Protected)
// PUT    /api/auth/preferences     — notification + privacy switches
// POST   /api/auth/change-password — needs the current password
// POST   /api/auth/delete-account  — needs the password + "DELETE"
// POST   /api/auth/avatar          — upload profile picture
// DELETE /api/auth/avatar          — remove profile picture
// ─────────────────────────────────────────────
const passwordCheckLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many attempts. Please try again after 15 minutes.",
});
const avatarLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: "Too many uploads. Please try again later.",
});
router.put("/preferences", auth, updatePreferences);
router.post("/change-password", auth, passwordCheckLimiter, changePassword);
router.post("/delete-account", auth, passwordCheckLimiter, deleteAccount);
router.post("/avatar", auth, avatarLimiter, uploadAvatar);
router.delete("/avatar", auth, removeAvatar);

module.exports = router;

