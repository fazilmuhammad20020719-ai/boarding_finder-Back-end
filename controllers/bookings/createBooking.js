const { query } = require("../../db");
const { createNotification } = require("../../utils/notificationUtils");

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
      "SELECT owner_id, price, title, approval_status, is_paused FROM listings WHERE listing_id = $1",
      [safe_listing_id]
    );

    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: "Listing not found" });
    }
    const { approval_status, is_paused } = listingResult.rows[0];
    if ((approval_status && approval_status !== 'approved') || is_paused) {
      return res.status(400).json({ error: "This listing is not currently accepting bookings" });
    }

    const { owner_id, price } = listingResult.rows[0];
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

    // Requested stay must not overlap blocked dates (manual, iCal-imported, or approved bookings)
    const conflict = await query(
      `SELECT 1 FROM calendar_blocks
       WHERE listing_id = $1 AND start_date < ($2::date + ($3 || ' months')::interval) AND end_date >= $2::date
       UNION ALL
       SELECT 1 FROM bookings
       WHERE listing_id = $1 AND status = 'approved'
         AND move_in_date < ($2::date + ($3 || ' months')::interval)
         AND (move_in_date + (duration_months || ' months')::interval) > $2::date
       LIMIT 1`,
      [safe_listing_id, move_in_date, String(safe_duration_months)]
    );
    if (conflict.rows.length > 0) {
      return res.status(409).json({ error: "The property is not available for the selected dates" });
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
