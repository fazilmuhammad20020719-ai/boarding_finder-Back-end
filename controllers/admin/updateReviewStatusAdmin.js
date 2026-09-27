const { query } = require("../../db");

const updateReviewStatusAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'pending', 'rejected'].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const sql = `
      UPDATE reviews
      SET status = $1, updated_at = NOW()
      WHERE review_id = $2
      RETURNING *;
    `;
    const result = await query(sql, [status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Review not found" });
    }

    return res.status(200).json({ message: "Review status updated", review: result.rows[0] });
  } catch (error) {
    console.error("Error updating review status:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { updateReviewStatusAdmin };
