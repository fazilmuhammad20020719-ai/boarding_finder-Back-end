const express = require("express");
const auth = require("../middleware/auth");
const getPendingUsers = require("../controllers/admin/getPendingUsers");
const verifyUser = require("../controllers/admin/verifyUser");
const getVerificationStats = require("../controllers/admin/getVerificationStats");
const getAllUsers = require("../controllers/admin/getAllUsers");
const updateUserStatus = require("../controllers/admin/updateUserStatus");
const updateUserRole = require("../controllers/admin/updateUserRole");
const { getAllAdminListings } = require("../controllers/admin/getAllAdminListings");
const { updateListingStatus } = require("../controllers/admin/updateListingStatus");
const { getPlatformAnalytics } = require("../controllers/admin/getPlatformAnalytics");
const { getAllAdminBookings } = require("../controllers/admin/getAllAdminBookings");
const { updateBookingStatusAdmin } = require("../controllers/admin/updateBookingStatusAdmin");
const router = express.Router();

// ─── Admin-only middleware ───────────────────
const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied. Admin privileges required." });
  }
  next();
};

// ─────────────────────────────────────────────
// GET /api/admin/pending-users
// ─────────────────────────────────────────────
router.get("/pending-users", auth, adminOnly, getPendingUsers);

// ─────────────────────────────────────────────
// PUT /api/admin/users/:id/verify
// ─────────────────────────────────────────────
router.put("/users/:id/verify", auth, adminOnly, verifyUser);

// ─────────────────────────────────────────────
// GET /api/admin/verification-stats
// ─────────────────────────────────────────────
router.get("/verification-stats", auth, adminOnly, getVerificationStats);

// ─────────────────────────────────────────────
// GET /api/admin/users
// ─────────────────────────────────────────────
router.get("/users", auth, adminOnly, getAllUsers);

// ─────────────────────────────────────────────
// PUT /api/admin/users/:id/status
// ─────────────────────────────────────────────
router.put("/users/:id/status", auth, adminOnly, updateUserStatus);

// ─────────────────────────────────────────────
// PUT /api/admin/users/:id/role
// ─────────────────────────────────────────────
// PUT /api/admin/users/:id/role
// ─────────────────────────────────────────────
router.put("/users/:id/role", auth, adminOnly, updateUserRole);

// ─────────────────────────────────────────────
// GET /api/admin/listings
// ─────────────────────────────────────────────
router.get("/listings", auth, adminOnly, getAllAdminListings);

// ─────────────────────────────────────────────
// PUT /api/admin/listings/:id/status
// ─────────────────────────────────────────────
router.put("/listings/:id/status", auth, adminOnly, updateListingStatus);

// ==============================================================================
// GET /api/admin/bookings
// ==============================================================================
router.get("/bookings", auth, adminOnly, getAllAdminBookings);

// ==============================================================================
// PUT /api/admin/bookings/:id/status
// ==============================================================================
router.put("/bookings/:id/status", auth, adminOnly, updateBookingStatusAdmin);

// ─────────────────────────────────────────────
// GET /api/admin/analytics
// ─────────────────────────────────────────────
router.get("/analytics", auth, adminOnly, getPlatformAnalytics);

module.exports = router;

