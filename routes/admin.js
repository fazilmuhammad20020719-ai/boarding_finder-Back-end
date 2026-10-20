const express = require("express");
const auth = require("../middleware/auth");
const getPendingUsers = require("../controllers/admin/getPendingUsers");
const verifyUser = require("../controllers/admin/verifyUser");
const getVerificationStats = require("../controllers/admin/getVerificationStats");
const getVerificationDoc = require("../controllers/auth/getVerificationDoc");
const getAllUsers = require("../controllers/admin/getAllUsers");
const updateUserStatus = require("../controllers/admin/updateUserStatus");
const updateUserRole = require("../controllers/admin/updateUserRole");
const { getAllAdminListings } = require("../controllers/admin/getAllAdminListings");
const { updateListingStatus } = require("../controllers/admin/updateListingStatus");
const { getPlatformAnalytics } = require("../controllers/admin/getPlatformAnalytics");
const { getAllAdminBookings } = require("../controllers/admin/getAllAdminBookings");
const { updateBookingStatusAdmin } = require("../controllers/admin/updateBookingStatusAdmin");
const { getAllAdminReviews } = require("../controllers/admin/getAllAdminReviews");
const { updateReviewStatusAdmin } = require("../controllers/admin/updateReviewStatusAdmin");
const { deleteReviewAdmin } = require("../controllers/admin/deleteReviewAdmin");
const { getAllAdminTickets, updateTicketStatusAdmin } = require("../controllers/admin/adminTickets");
const { broadcastAnnouncement } = require("../controllers/admin/broadcastAnnouncement");
const { getPlatformSettings, updatePlatformSettings } = require("../controllers/admin/settings");
const auditLog = require("../middleware/auditLog");
const { parsePagination, paginated } = require("../utils/pagination");
const { query } = require("../db");
const router = express.Router();

// ─── Admin-only middleware ───────────────────
const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied. Admin privileges required." });
  }
  next();
};

// Every successful admin write is recorded in audit_logs
router.use(auth, adminOnly, auditLog);

// ─────────────────────────────────────────────
// GET /api/admin/audit-logs  — who did what, newest first
// ─────────────────────────────────────────────
router.get("/audit-logs", async (req, res) => {
  try {
    const page = parsePagination(req);
    const result = await query(
      `SELECT a.*, u.name AS admin_name, u.email AS admin_email, COUNT(*) OVER() AS total_count
       FROM audit_logs a LEFT JOIN users u ON a.admin_id = u.id
       ORDER BY a.created_at DESC
       LIMIT $1 OFFSET $2`,
      [page.limit, page.offset]
    );
    res.json(paginated("logs", result.rows, page));
  } catch (err) {
    console.error("Error fetching audit logs:", err);
    res.status(500).json({ message: "Server error while fetching audit logs" });
  }
});

// ─────────────────────────────────────────────
// GET /api/admin/pending-users
// ─────────────────────────────────────────────
router.get("/pending-users", auth, adminOnly, getPendingUsers);

// ─────────────────────────────────────────────
// PUT /api/admin/users/:id/verify
// ─────────────────────────────────────────────
router.put("/users/:id/verify", auth, adminOnly, verifyUser);

// ─────────────────────────────────────────────
// GET /api/admin/users/:id/verification-docs/:index
// Streams a private identity document (never exposed via public URLs)
// ─────────────────────────────────────────────
router.get("/users/:id/verification-docs/:index", auth, adminOnly, getVerificationDoc);

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

// ==============================================================================
// GET /api/admin/reviews
// ==============================================================================
router.get("/reviews", auth, adminOnly, getAllAdminReviews);

// ==============================================================================
// PUT /api/admin/reviews/:id/status
// ==============================================================================
router.put("/reviews/:id/status", auth, adminOnly, updateReviewStatusAdmin);

// ==============================================================================
// DELETE /api/admin/reviews/:id
// ==============================================================================
router.delete("/reviews/:id", auth, adminOnly, deleteReviewAdmin);

// ==============================================================================
// GET /api/admin/tickets
// ==============================================================================
router.get("/tickets", auth, adminOnly, getAllAdminTickets);

// ==============================================================================
// PUT /api/admin/tickets/:id/status
// ==============================================================================
router.put("/tickets/:id/status", auth, adminOnly, updateTicketStatusAdmin);

// ==============================================================================
// POST /api/admin/announcements
// ==============================================================================
router.post("/announcements", auth, adminOnly, broadcastAnnouncement);

// ==============================================================================
// GET /api/admin/settings
// PUT /api/admin/settings
// ==============================================================================
router.get("/settings", auth, adminOnly, getPlatformSettings);
router.put("/settings", auth, adminOnly, updatePlatformSettings);

module.exports = router;
