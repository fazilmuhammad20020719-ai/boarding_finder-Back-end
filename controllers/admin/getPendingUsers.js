const { query } = require("../../db");

/**
 * GET /api/admin/pending-users
 * Returns all users who have submitted verification documents and are awaiting admin review.
 */
const getPendingUsers = async (req, res) => {
  try {
    const result = await query(`
      SELECT id, name, email, phone, role,
             university, course, student_id,
             property_name, property_type, permit_number, property_address,
             is_email_verified, verification_status, verification_docs, verification_note,
             account_status, created_at
      FROM users
      WHERE verification_status = 'pending'
        AND verification_docs IS NOT NULL
        AND array_length(verification_docs, 1) > 0
      ORDER BY created_at DESC
    `);

    return res.status(200).json({
      message: "Pending users fetched successfully.",
      users: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error("Get pending users error:", err.message);
    return res.status(500).json({ message: "Server error." });
  }
};

module.exports = getPendingUsers;
