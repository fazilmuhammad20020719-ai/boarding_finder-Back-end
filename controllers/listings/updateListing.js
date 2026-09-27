const { query } = require("../../db");
const {
  validateTitle, validateDescription, validateStringLength, validateFinancial, collectErrors,
} = require("../../utils/validators");
const { sanitizeHtml } = require("../../utils/sanitize");

const updateListing = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, price, security_deposit, location, latitude, longitude, amenities, image_urls } = req.body;
    const owner_id = req.user.id;

    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Only owners can update listings." });
    }

    // ── Input validation & sanitization (only validate fields that were actually sent) ──
    const checks = [];
    let sanitizedDescription = description;
    
    if (title !== undefined)       checks.push(validateTitle(title));
    if (description !== undefined) {
      sanitizedDescription = sanitizeHtml(description);
      checks.push(validateDescription(sanitizedDescription));
    }
    if (location !== undefined)    checks.push(validateStringLength(location, "Location", 2, 500));
    if (price !== undefined)       checks.push(validateFinancial(price, "Price"));
    if (security_deposit !== undefined) checks.push(validateFinancial(security_deposit, "Security Deposit"));
    
    if (checks.length > 0) {
      const validation = collectErrors(checks);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.errors[0], errors: validation.errors });
      }
    }

    // Verify ownership
    const checkSql = "SELECT owner_id FROM listings WHERE listing_id = $1";
    const checkResult = await query(checkSql, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: "Listing not found" });
    }

    if (checkResult.rows[0].owner_id !== owner_id) {
      return res.status(403).json({ message: "You are not authorized to update this listing." });
    }

    const sql = `
      UPDATE listings
      SET title = COALESCE($1, title),
          description = COALESCE($2, description),
          price = COALESCE($3, price),
          security_deposit = COALESCE($4, security_deposit),
          location = COALESCE($5, location),
          latitude = COALESCE($6, latitude),
          longitude = COALESCE($7, longitude),
          amenities = COALESCE($8, amenities),
          image_urls = COALESCE($9, image_urls),
          updated_at = NOW()
      WHERE listing_id = $10
      RETURNING *;
    `;

    const values = [
      title || null,
      sanitizedDescription || null,
      price || null,
      security_deposit || null,
      location || null,
      latitude || null,
      longitude || null,
      amenities || null,
      image_urls || null,
      id
    ];

    const result = await query(sql, values);

    return res.status(200).json({
      message: "Listing updated successfully",
      listing: result.rows[0],
    });
  } catch (err) {
    console.error("Error updating listing:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { updateListing };
