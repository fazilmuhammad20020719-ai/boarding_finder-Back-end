const { query } = require("../../db");
const { parsePagination, paginated } = require("../../utils/pagination");

const getAllAdminReviews = async (req, res) => {
  try {
    const sql = `
      SELECT r.*, l.title as listing_title, u.name as reviewer_name, u.email as reviewer_email,
             COUNT(*) OVER() AS total_count
      FROM reviews r
      JOIN listings l ON r.listing_id = l.listing_id
      JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
      LIMIT $1 OFFSET $2;
    `;
    const page = parsePagination(req);
    const result = await query(sql, [page.limit, page.offset]);
    return res.status(200).json(paginated("reviews", result.rows, page));
  } catch (error) {
    console.error("Error fetching admin reviews:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getAllAdminReviews };
