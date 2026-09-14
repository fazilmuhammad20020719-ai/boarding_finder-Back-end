const { query } = require("../../db");

const getMyListings = async (req, res) => {
  try {
    const owner_id = req.user.id;

    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Only owners can access their listings." });
    }

    const sql = `
      SELECT *
      FROM listings
      WHERE owner_id = $1
      ORDER BY created_at DESC;
    `;
    const result = await query(sql, [owner_id]);

    return res.status(200).json({
      listings: result.rows,
    });
  } catch (err) {
    console.error("Error fetching my listings:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getMyListings };
