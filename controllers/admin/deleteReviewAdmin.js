const { query } = require("../../db");

const deleteReviewAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM reviews
      WHERE review_id = $1
      RETURNING *;
    `;
    const result = await query(sql, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Review not found" });
    }

    return res.status(200).json({ message: "Review deleted successfully" });
  } catch (error) {
    console.error("Error deleting review:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { deleteReviewAdmin };
