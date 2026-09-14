const { query } = require("../../db");

const getMyBookings = async (req, res) => {
  try {
    const seeker_id = req.user.id;

    const result = await query(
      `SELECT b.*, l.title, l.location, l.price, l.image_urls
       FROM bookings b
       JOIN listings l ON b.listing_id = l.listing_id
       WHERE b.seeker_id = $1
       ORDER BY b.created_at DESC`,
      [seeker_id]
    );

    res.status(200).json({ bookings: result.rows });
  } catch (err) {
    console.error("Get my bookings error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const getOwnerBookings = async (req, res) => {
  try {
    const owner_id = req.user.id;

    const result = await query(
      `SELECT b.*, l.title, u.name as seeker_name, u.email as seeker_email,
              lease.status as lease_status
       FROM bookings b
       JOIN listings l ON b.listing_id = l.listing_id
       JOIN users u ON b.seeker_id = u.id
       LEFT JOIN leases lease ON b.booking_id = lease.booking_id
       WHERE b.owner_id = $1
       ORDER BY b.created_at DESC`,
      [owner_id]
    );

    res.status(200).json({ bookings: result.rows });
  } catch (err) {
    console.error("Get owner bookings error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const updateBookingStatus = async (req, res) => {
  try {
    const owner_id = req.user.id;
    const booking_id = req.params.id;
    const { status } = req.body;

    if (!['approved', 'rejected', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    // Verify ownership
    const bookingRes = await query("SELECT owner_id FROM bookings WHERE booking_id = $1", [booking_id]);
    if (bookingRes.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (bookingRes.rows[0].owner_id !== owner_id && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const updated = await query(
      "UPDATE bookings SET status = $1, updated_at = NOW() WHERE booking_id = $2 RETURNING *",
      [status, booking_id]
    );

    res.status(200).json({ message: "Booking updated", booking: updated.rows[0] });
  } catch (err) {
    console.error("Update booking status error:", err);
    res.status(500).json({ error: "Server error" });
  }
};


/**
 * Check if the current logged-in user already has a booking for a specific listing.
 * Returns { booking: null } if none found, or { booking: {...} } with status if found.
 */
const checkBookingForListing = async (req, res) => {
  try {
    const seeker_id = req.user.id;
    const { listingId } = req.params;

    const result = await query(
      `SELECT booking_id, status, move_in_date, duration_months, total_amount
       FROM bookings
       WHERE seeker_id = $1 AND listing_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [seeker_id, listingId]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({ booking: null });
    }

    res.status(200).json({ booking: result.rows[0] });
  } catch (err) {
    console.error("Check booking error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = { getMyBookings, getOwnerBookings, updateBookingStatus, checkBookingForListing };
