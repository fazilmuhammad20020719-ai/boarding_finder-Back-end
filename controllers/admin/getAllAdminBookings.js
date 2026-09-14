const pool = require("../../db");

const getAllAdminBookings = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        b.booking_id, b.move_in_date, b.duration_months, b.status, b.total_amount, b.message, b.created_at,
        l.listing_id, l.title as listing_title, l.location as listing_location,
        s.id as seeker_id, s.name as seeker_name, s.email as seeker_email, s.phone as seeker_phone,
        o.id as owner_id, o.name as owner_name, o.email as owner_email, o.phone as owner_phone
      FROM bookings b
      LEFT JOIN listings l ON b.listing_id = l.listing_id
      LEFT JOIN users s ON b.seeker_id = s.id
      LEFT JOIN users o ON b.owner_id = o.id
      ORDER BY b.created_at DESC
    `);

    res.json({ bookings: result.rows });
  } catch (err) {
    console.error("Error fetching all admin bookings:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getAllAdminBookings };
