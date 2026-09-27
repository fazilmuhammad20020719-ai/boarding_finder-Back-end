const { query } = require("../../db");

const getAllAdminReviews = async (req, res) => {
  try {
    const sql = `
      SELECT r.*, l.title as listing_title, u.name as reviewer_name, u.email as reviewer_email
      FROM reviews r
      JOIN listings l ON r.listing_id = l.listing_id
      JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC;
    `;
    const result = await query(sql);
    return res.status(200).json({ reviews: result.rows });
  } catch (error) {
    console.error("Error fetching admin reviews:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getAllAdminReviews };
