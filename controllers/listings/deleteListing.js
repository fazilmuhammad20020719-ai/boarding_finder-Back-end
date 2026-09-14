const { query } = require("../../db");

const deleteListing = async (req, res) => {
  try {
    const { id } = req.params;
    const owner_id = req.user.id;
    
    console.log(`[DELETE LISTING] Request received to delete listing_id: ${id} by user_id: ${owner_id}`);

    if (req.user.role !== "owner") {
      console.log(`[DELETE LISTING] Failed: User is not owner. Role is: ${req.user.role}`);
      return res.status(403).json({ message: "Only owners can delete listings." });
    }

    // Verify ownership
    const checkSql = "SELECT owner_id FROM listings WHERE listing_id = $1";
    const checkResult = await query(checkSql, [id]);

    if (checkResult.rows.length === 0) {
      console.log(`[DELETE LISTING] Failed: Listing ${id} not found in DB`);
      return res.status(404).json({ message: "Listing not found" });
    }

    const dbOwnerId = checkResult.rows[0].owner_id;
    if (dbOwnerId !== owner_id) {
      console.log(`[DELETE LISTING] Failed: Unauthorized. DB owner_id: ${dbOwnerId}, Token owner_id: ${owner_id}`);
      return res.status(403).json({ message: "You are not authorized to delete this listing." });
    }

    const sql = "DELETE FROM listings WHERE listing_id = $1";
    await query(sql, [id]);
    
    console.log(`[DELETE LISTING] Success! Listing ${id} deleted.`);

    return res.status(200).json({
      message: "Listing deleted successfully",
    });
  } catch (err) {
    console.error(`[DELETE LISTING] Exception thrown:`, err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { deleteListing };
