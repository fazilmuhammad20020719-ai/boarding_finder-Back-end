const { query } = require("../../db");
const {
  validateTitle, validateDescription, validateStringLength, validateFinancial, collectErrors,
} = require("../../utils/validators");
const { sanitizeHtml } = require("../../utils/sanitize");

const createListing = async (req, res) => {
  try {
    const { title, description, price, security_deposit, location, latitude, longitude, amenities, image_urls } = req.body;
    const owner_id = req.user.id;

    if (!title || !description || !price || !location) {
      return res.status(400).json({ message: "Please provide title, description, price, and location." });
    }

    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Only owners can create listings." });
    }

    // ── Input validation & sanitization ──
    const sanitizedDescription = sanitizeHtml(description);

    const validation = collectErrors([
      validateTitle(title),
      validateDescription(sanitizedDescription),
      validateStringLength(location, "Location", 2, 500),
      validateFinancial(price, "Price"),
      validateFinancial(security_deposit, "Security Deposit"),
    ]);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.errors[0], errors: validation.errors });
    }

    const sql = `
      INSERT INTO listings (owner_id, title, description, price, security_deposit, location, latitude, longitude, amenities, image_urls)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `;

    const values = [
      owner_id,
      title,
      sanitizedDescription,
      price,
      security_deposit || null,
      location,
      latitude || null,
      longitude || null,
      amenities || null,
      image_urls || null,
    ];

    const result = await query(sql, values);

    return res.status(201).json({
      message: "Listing created successfully",
      listing: result.rows[0],
    });
  } catch (err) {
    console.error("Error creating listing:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { createListing };
