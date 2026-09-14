const pool = require("../../db");

const getAllAdminListings = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, u.name as owner_name, u.email as owner_email 
       FROM listings l
       JOIN users u ON l.owner_id = u.id
       ORDER BY l.created_at DESC`
    );

    res.status(200).json({ listings: result.rows });
  } catch (err) {
    console.error("Error fetching admin listings:", err);
    res.status(500).json({ message: "Server error while fetching listings" });
  }
};

module.exports = { getAllAdminListings };
