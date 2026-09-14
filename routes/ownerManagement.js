const express = require("express");
const auth = require("../middleware/auth");
const getLinkedStudents = require("../controllers/owner/getLinkedStudents");
const updateStudentStatus = require("../controllers/owner/updateStudentStatus");
const { getOverviewStats } = require("../controllers/owner/getOverviewStats");

const router = express.Router();

// ─── Owner-only middleware ───────────────────
const ownerOnly = (req, res, next) => {
  if (req.user.role !== "owner") {
    return res.status(403).json({ message: "Access denied. Owner privileges required." });
  }
  next();
};

// ─────────────────────────────────────────────
// GET /api/owner/students
// ─────────────────────────────────────────────
router.get("/students", auth, ownerOnly, getLinkedStudents);

// ─────────────────────────────────────────────
// PUT /api/owner/students/:id/status
// ─────────────────────────────────────────────
router.put("/students/:id/status", auth, ownerOnly, updateStudentStatus);

// ─────────────────────────────────────────────
// GET /api/owner/overview-stats
// ─────────────────────────────────────────────
router.get("/overview-stats", auth, ownerOnly, getOverviewStats);

module.exports = router;
