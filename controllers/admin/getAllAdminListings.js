const { parsePagination, paginated } = require("../../utils/pagination");
const pool = require("../../db");

const getAllAdminListings = async (req, res) => {
  try {
    const page = parsePagination(req);
    const result = await pool.query(
      `SELECT l.*, u.name as owner_name, u.email as owner_email,
              COUNT(*) OVER() AS total_count
       FROM listings l
       JOIN users u ON l.owner_id = u.id
       ORDER BY l.created_at DESC
       LIMIT $1 OFFSET $2`,
      [page.limit, page.offset]
    );

    res.status(200).json(paginated("listings", result.rows, page));
  } catch (err) {
    console.error("Error fetching admin listings:", err);
    res.status(500).json({ message: "Server error while fetching listings" });
  }
};

module.exports = { getAllAdminListings };
