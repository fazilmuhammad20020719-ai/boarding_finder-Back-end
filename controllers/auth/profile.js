const { query } = require("../../db");

const profile = async (req, res) => {
  try {
    const {
      name, phone,
      // Student fields
      university, course,
      // Owner fields
      propertyName, propertyType, permitNumber, propertyAddress,
    } = req.body;

    // Build the update query dynamically based on user role
    const result = await query(
      `UPDATE users SET
        name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        university = COALESCE($3, university),
        course = COALESCE($4, course),
        property_name = COALESCE($5, property_name),
        property_type = COALESCE($6, property_type),
        permit_number = COALESCE($7, permit_number),
        property_address = COALESCE($8, property_address),
        updated_at = NOW()
      WHERE id = $9
      RETURNING id, name, email, phone, role, university, course, student_id,
                property_name, property_type, permit_number, property_address, created_at, updated_at`,
      [
        name || null,
        phone || null,
        university || null,
        course || null,
        propertyName || null,
        propertyType || null,
        permitNumber || null,
        propertyAddress || null,
        req.user.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.status(200).json({
      message: "Profile updated successfully!",
      user: result.rows[0],
    });
  } catch (err) {
    console.error("Update profile error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

module.exports = profile;
