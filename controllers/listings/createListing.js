const { query } = require("../../db");
const {
  validateTitle, validateDescription, validateStringLength, validateFinancial, collectErrors,
  validateCoordinates, validateTourUrl,
} = require("../../utils/validators");
const { parseListingDetails } = require("../../utils/listingDetails");

const createListing = async (req, res) => {
  try {
    const { title, description, price, security_deposit, location, latitude, longitude, amenities, image_urls, virtual_tour_url } = req.body;
    const owner_id = req.user.id;

    if (!title || !description || !price || !location) {
      return res.status(400).json({ message: "Please provide title, description, price, and location." });
    }

    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Only owners can create listings." });
    }

    // ── Input validation ──
    // Text is stored as typed. The React frontend renders it as plain text, so
    // HTML-escaping here would double-escape it ("&lt;" shown to users).
    const validation = collectErrors([
      validateTitle(title),
      validateDescription(description),
      validateStringLength(location, "Location", 2, 500),
      validateFinancial(price, "Price"),
      validateFinancial(security_deposit, "Security Deposit"),
      validateCoordinates(latitude, longitude),
      validateTourUrl(virtual_tour_url),
    ]);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.errors[0], errors: validation.errors });
    }

    const details = parseListingDetails(req.body);
    if (details.error) {
      return res.status(400).json({ message: details.error });
    }
    const d = details.values;

    const sql = `
      INSERT INTO listings (owner_id, title, description, price, security_deposit, location, latitude, longitude,
                            amenities, image_urls, virtual_tour_url,
                            university, property_type, distance_to_university, min_stay_months, house_rules, capacity)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *;
    `;

    const values = [
      owner_id,
      title.trim(),
      description.trim(),
      price,
      security_deposit || null,
      location,
      latitude || null,
      longitude || null,
      amenities || null,
      image_urls || null,
      virtual_tour_url || null,
      d.university ?? null,
      d.property_type ?? null,
      d.distance_to_university ?? null,
      d.min_stay_months ?? null,
      d.house_rules ?? {},
      d.capacity ?? 1,
    ];

    const result = await query(sql, values);
    const { ical_token, ical_import_url, ...listing } = result.rows[0];

    return res.status(201).json({
      message: "Listing created successfully",
      listing,
    });
  } catch (err) {
    console.error("Error creating listing:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { createListing };
