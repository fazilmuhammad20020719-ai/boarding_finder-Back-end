const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");

const { createBooking } = require("../controllers/bookings/createBooking");
const { getMyBookings, getOwnerBookings, updateBookingStatus, updatePaymentStatus, updateStay, checkBookingForListing } = require("../controllers/bookings/bookingManagement");

// All booking routes require authentication
router.use(auth);

// Student/Seeker routes
router.post("/", createBooking);
router.get("/my-bookings", getMyBookings);
router.get("/check/:listingId", checkBookingForListing);

// Owner routes
router.get("/owner-bookings", getOwnerBookings);
router.put("/:id/status", updateBookingStatus);
// Owner (or admin) confirms the Cash on Move-in payment was received
router.put("/:id/payment", updatePaymentStatus);
// Owner (or admin) records when the student arrived and left
router.put("/:id/stay", updateStay);

module.exports = router;
