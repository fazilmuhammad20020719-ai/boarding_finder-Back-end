const { query } = require("../../db");

const me = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, email, phone, role,
              university, course, student_id,
              property_name, property_type, permit_number, property_address,
              is_email_verified, verification_status, verification_docs,
              account_status, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.status(200).json({ user: result.rows[0] });
  } catch (err) {
    console.error("Me error:", err.message);
    return res.status(500).json({ message: "Server error." });
  }
};

module.exports = me;
