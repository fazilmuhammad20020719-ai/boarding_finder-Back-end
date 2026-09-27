const { query } = require("../../db");

const duplicateListing = async (req, res) => {
  try {
    const { id } = req.params;
    const owner_id = req.user.id;

    // Fetch the original listing
    const originalRes = await query("SELECT * FROM listings WHERE listing_id = $1", [id]);
    if (originalRes.rows.length === 0) {
      return res.status(404).json({ message: "Listing not found" });
    }

    const original = originalRes.rows[0];

    // Verify ownership
    if (original.owner_id !== owner_id && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Insert duplicated listing
    const insertSql = `
      INSERT INTO listings (
        owner_id, title, description, price, security_deposit, 
        location, latitude, longitude, amenities, image_urls, 
        approval_status, is_paused, views
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
    `;
    
    // Append (Copy) to the title
    const newTitle = `${original.title} (Copy)`;

    const duplicatedRes = await query(insertSql, [
      original.owner_id,
      newTitle,
      original.description,
      original.price,
      original.security_deposit,
      original.location,
      original.latitude,
      original.longitude,
      original.amenities,
      original.image_urls,
      'pending', // Duplicates should arguably go to pending, or 'approved' if auto-approved
      false, // is_paused
      0 // views start at 0
    ]);

    res.status(201).json({ message: "Listing duplicated successfully", listing: duplicatedRes.rows[0] });
  } catch (err) {
    console.error("Error duplicating listing:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { duplicateListing };
