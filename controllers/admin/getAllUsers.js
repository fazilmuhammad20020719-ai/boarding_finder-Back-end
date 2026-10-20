const { parsePagination, paginated } = require("../../utils/pagination");
const pool = require("../../db");

const getAllUsers = async (req, res) => {
  try {
    const page = parsePagination(req);
    const result = await pool.query(
      `SELECT id, name, email, role, account_status, verification_status, created_at,
              COUNT(*) OVER() AS total_count
       FROM users 
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [page.limit, page.offset]
    );

    res.status(200).json(paginated("users", result.rows, page));
  } catch (err) {
    console.error("Error fetching all users:", err);
    res.status(500).json({ message: "Server error while fetching users" });
  }
};

module.exports = getAllUsers;
