const pool = require("../../db");

const updateListingStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'approved', 'rejected', 'suspended'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid status value provided." });
  }

  try {
    const result = await pool.query(
      `UPDATE listings 
       SET approval_status = $1, updated_at = NOW() 
       WHERE listing_id = $2 
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Listing not found." });
    }

    res.status(200).json({ 
      message: "Listing status updated successfully", 
      listing: result.rows[0] 
    });
  } catch (err) {
    console.error("Error updating listing status:", err);
    res.status(500).json({ message: "Server error while updating listing status" });
  }
};

module.exports = { updateListingStatus };
