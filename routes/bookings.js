const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");

const { createBooking } = require("../controllers/bookings/createBooking");
const { getMyBookings, getOwnerBookings, updateBookingStatus, getPayments, addPayment, removePayment, updateStay, checkBookingForListing } = require("../controllers/bookings/bookingManagement");

// All booking routes require authentication
router.use(auth);

// Student/Seeker routes
router.post("/", createBooking);
router.get("/my-bookings", getMyBookings);
router.get("/check/:listingId", checkBookingForListing);

// Owner routes
router.get("/owner-bookings", getOwnerBookings);
router.put("/:id/status", updateBookingStatus);
// Payments the student made before arrival (recorded by the owner or an admin)
router.get("/:id/payments", getPayments);
router.post("/:id/payments", addPayment);
router.delete("/:id/payments/:paymentId", removePayment);
// Owner (or admin) records when the student arrived and left
router.put("/:id/stay", updateStay);

module.exports = router;
