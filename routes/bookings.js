const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");

const { createBooking } = require("../controllers/bookings/createBooking");
const { getMyBookings, getOwnerBookings, updateBookingStatus, checkBookingForListing } = require("../controllers/bookings/bookingManagement");

// All booking routes require authentication
router.use(auth);

// Student/Seeker routes
router.post("/", createBooking);
router.get("/my-bookings", getMyBookings);
router.get("/check/:listingId", checkBookingForListing);

// Owner routes
router.get("/owner-bookings", getOwnerBookings);
router.put("/:id/status", updateBookingStatus);

module.exports = router;
