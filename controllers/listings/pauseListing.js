const { query } = require("../../db");

const pauseListing = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_paused } = req.body;
    const owner_id = req.user.id;

    // Verify ownership
    const listingRes = await query("SELECT owner_id FROM listings WHERE listing_id = $1", [id]);
    if (listingRes.rows.length === 0) {
      return res.status(404).json({ message: "Listing not found" });
    }

    if (listingRes.rows[0].owner_id !== owner_id && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const result = await query(
      "UPDATE listings SET is_paused = $1, updated_at = NOW() WHERE listing_id = $2 RETURNING *",
      [is_paused, id]
    );

    res.status(200).json({ message: "Listing pause status updated", listing: result.rows[0] });
  } catch (err) {
    console.error("Error pausing listing:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { pauseListing };
