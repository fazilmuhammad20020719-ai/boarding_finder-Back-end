const { query } = require("../../db");

const getAllListings = async (req, res) => {
  try {
    const sql = `
      SELECT l.*, u.name as owner_name, u.email as owner_email
      FROM listings l
      JOIN users u ON l.owner_id = u.id
      WHERE l.approval_status = 'approved' OR l.approval_status IS NULL
      ORDER BY l.created_at DESC;
    `;
    const result = await query(sql);

    return res.status(200).json({
      listings: result.rows,
    });
  } catch (err) {
    console.error("Error fetching listings:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getAllListings };
