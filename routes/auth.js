const express = require("express");
const auth = require("../middleware/auth");

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

// ─────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────
router.post("/register", (req, res, next) => {
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
router.post("/login", login);

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
router.post("/verify-otp", auth, verifyOtp);

// ─────────────────────────────────────────────
// POST /api/auth/resend-otp  (Protected)
// ─────────────────────────────────────────────
router.post("/resend-otp", auth, resendOtp);

// ─────────────────────────────────────────────
// POST /api/auth/upload-verification-docs (Protected)
// ─────────────────────────────────────────────
router.post("/upload-verification-docs", auth, uploadVerificationDocs);

module.exports = router;
