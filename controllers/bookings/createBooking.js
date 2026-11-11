const { query } = require("../../db");
const { createNotification } = require("../../utils/notificationUtils");
const { OCCUPANCY_LATERAL, withAvailability } = require("../../utils/occupancy");

const createBooking = async (req, res) => {
  try {
    const { listing_id, move_in_date, duration_months, message } = req.body;
    const seeker_id = parseInt(req.user.id, 10);
    const safe_listing_id = parseInt(listing_id, 10);
    const safe_duration_months = parseInt(duration_months, 10);

    // Validate request
    if (!safe_listing_id || !move_in_date || !safe_duration_months) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(move_in_date)) || Number.isNaN(Date.parse(move_in_date))) {
      return res.status(400).json({ error: "Move-in date must be a valid date (YYYY-MM-DD)" });
    }
    if (String(move_in_date).slice(0, 10) < new Date().toISOString().slice(0, 10)) {
      return res.status(400).json({ error: "Move-in date must be today or in the future" });
    }
    if (safe_duration_months < 1 || safe_duration_months > 48) {
      return res.status(400).json({ error: "Duration must be between 1 and 48 months" });
    }
    if (message && String(message).length > 500) {
      return res.status(400).json({ error: "Message must not exceed 500 characters" });
    }

    // Get the listing details to find owner and price
    const listingResult = await query(
      "SELECT owner_id, price, title, approval_status, is_paused, min_stay_months FROM listings WHERE listing_id = $1",
      [safe_listing_id]
    );

    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: "Listing not found" });
    }
    const { approval_status, is_paused } = listingResult.rows[0];
    if ((approval_status && approval_status !== 'approved') || is_paused) {
      return res.status(400).json({ error: "This listing is not currently accepting bookings" });
    }

    const { owner_id, price, min_stay_months } = listingResult.rows[0];
    if (min_stay_months && safe_duration_months < min_stay_months) {
      return res.status(400).json({ error: `This property has a minimum stay of ${min_stay_months} months.` });
    }
    const safe_owner_id = parseInt(owner_id, 10);

    if (safe_owner_id === seeker_id) {
      return res.status(400).json({ error: "You cannot book your own listing" });
    }

    // Check for existing bookings that haven't been rejected or cancelled
    const existingBooking = await query(
      "SELECT booking_id FROM bookings WHERE listing_id = $1 AND seeker_id = $2 AND status NOT IN ('rejected', 'cancelled')",
      [safe_listing_id, seeker_id]
    );

    if (existingBooking.rows.length > 0) {
      return res.status(400).json({ error: "You already have an active booking request for this listing" });
    }

    // Requested stay must not overlap dates the owner blocked (manual or iCal-imported)
    const conflict = await query(
      `SELECT 1 FROM calendar_blocks
       WHERE listing_id = $1 AND start_date < ($2::date + ($3 || ' months')::interval) AND end_date >= $2::date
       LIMIT 1`,
      [safe_listing_id, move_in_date, String(safe_duration_months)]
    );
    if (conflict.rows.length > 0) {
      return res.status(409).json({ error: "The property is not available for the selected dates" });
    }

    // Shared rooms: refuse new requests once every bed is taken by a confirmed booking
    const beds = await query(
      `SELECT l.capacity, occ.occupied_count
       FROM listings l LEFT JOIN LATERAL (${OCCUPANCY_LATERAL}) occ ON TRUE
       WHERE l.listing_id = $1`,
      [safe_listing_id]
    );
    const room = withAvailability(beds.rows[0]);
    if (room.is_fully_booked) {
      return res.status(409).json({ error: "This room is fully booked.", code: "fully_booked" });
    }

    // Calculate total amount
    let total_amount = parseFloat(price) * safe_duration_months;
    if (isNaN(total_amount)) total_amount = 0; // Prevent NaN in numeric column

    // Insert booking
    const newBooking = await query(
      `INSERT INTO bookings 
       (listing_id, seeker_id, owner_id, move_in_date, duration_months, total_amount, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [safe_listing_id, seeker_id, safe_owner_id, move_in_date, safe_duration_months, total_amount, message ? String(message).trim() : null]
    );

    await createNotification(
      safe_owner_id,
      'booking_request',
      "New Booking Request",
      `You have a new booking request for ${listingResult.rows[0].title} starting ${String(move_in_date).slice(0, 10)} (${safe_duration_months} months).`,
      '/manage-reservations'
    );

    res.status(201).json({
      message: "Booking requested successfully",
      booking: newBooking.rows[0],
    });
  } catch (err) {
    console.error("Create booking error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = { createBooking };
