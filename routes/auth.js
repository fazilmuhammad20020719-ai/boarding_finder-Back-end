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

const router = express.Router();

// ─── Rate Limiters ───────────────────────────
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 5,                      // 5 attempts per window
  message: "Too many login attempts. Please try again after 15 minutes.",
});

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
    return registerAdmin(req, res, next);
  } else {
    return res.status(400).json({ message: "Role must be 'student', 'owner', or 'admin'." });
  }
});

// ─────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────
router.post("/login", loginLimiter, login);

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

module.exports = router;

