const { query } = require("../../db");

/**
 * GET /api/owner/students
 * Returns all students linked to the owner's properties via approved bookings.
 */
const getLinkedStudents = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const result = await query(`
      SELECT DISTINCT
        u.id, u.name, u.email, u.phone, u.university, u.course, u.student_id,
        u.account_status, u.verification_status,
        l.title AS property_name,
        l.listing_id,
        b.status AS booking_status,
        b.move_in_date,
        b.duration_months,
        b.created_at AS booking_date
      FROM bookings b
      JOIN users u ON u.id = b.seeker_id
      JOIN listings l ON l.listing_id = b.listing_id
      WHERE l.owner_id = $1
        AND b.status = 'approved'
      ORDER BY b.created_at DESC
    `, [ownerId]);

    return res.status(200).json({
      message: "Linked students fetched successfully.",
      students: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error("Get linked students error:", err.message);
    return res.status(500).json({ message: "Server error." });
  }
};

module.exports = getLinkedStudents;
