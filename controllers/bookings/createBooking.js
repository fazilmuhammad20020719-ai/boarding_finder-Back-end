const { query } = require("../../db");

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

    // Get the listing details to find owner and price
    const listingResult = await query(
      "SELECT owner_id, price FROM listings WHERE listing_id = $1",
      [safe_listing_id]
    );

    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: "Listing not found" });
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

    // Calculate total amount
    let total_amount = parseFloat(price) * safe_duration_months;
    if (isNaN(total_amount)) total_amount = 0; // Prevent NaN in numeric column

    // Insert booking
    const newBooking = await query(
      `INSERT INTO bookings 
       (listing_id, seeker_id, owner_id, move_in_date, duration_months, total_amount, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [safe_listing_id, seeker_id, safe_owner_id, move_in_date, safe_duration_months, total_amount, message]
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
