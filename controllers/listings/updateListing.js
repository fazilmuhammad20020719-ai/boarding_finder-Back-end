const { query } = require("../../db");
const {
  validateTitle, validateDescription, validateStringLength, validateFinancial, collectErrors,
  validateCoordinates, validateTourUrl,
} = require("../../utils/validators");
const { parseListingDetails } = require("../../utils/listingDetails");
const { HOLDS_BED } = require("../../utils/occupancy");

const updateListing = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, price, security_deposit, location, latitude, longitude, amenities, image_urls, virtual_tour_url } = req.body;
    const owner_id = req.user.id;

    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Only owners can update listings." });
    }

    // ── Input validation (only validate fields that were actually sent) ──
    // Text is stored as typed; the frontend renders it as plain text.
    const checks = [];
    if (title !== undefined)       checks.push(validateTitle(title));
    if (description !== undefined) checks.push(validateDescription(description));
    if (location !== undefined)    checks.push(validateStringLength(location, "Location", 2, 500));
    if (price !== undefined)       checks.push(validateFinancial(price, "Price"));
    if (security_deposit !== undefined) checks.push(validateFinancial(security_deposit, "Security Deposit"));
    checks.push(validateCoordinates(latitude, longitude));
    checks.push(validateTourUrl(virtual_tour_url));

    const validation = collectErrors(checks);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.errors[0], errors: validation.errors });
    }

    const details = parseListingDetails(req.body);
    if (details.error) {
      return res.status(400).json({ message: details.error });
    }

    // Verify ownership
    const checkResult = await query("SELECT owner_id FROM listings WHERE listing_id = $1", [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: "Listing not found" });
    }
    if (checkResult.rows[0].owner_id !== owner_id) {
      return res.status(403).json({ message: "You are not authorized to update this listing." });
    }

    // Capacity can't drop below the beds already taken by confirmed bookings
    if (details.values.capacity !== undefined) {
      const taken = await query(
        `SELECT COUNT(*)::int AS n FROM bookings b WHERE b.listing_id = $1 AND ${HOLDS_BED}`,
        [id]
      );
      if (details.values.capacity < taken.rows[0].n) {
        return res.status(400).json({
          message: `Capacity can't be less than the ${taken.rows[0].n} confirmed bookings this room already has.`,
        });
      }
    }

    const values = [
      title ? title.trim() : null,
      description ? description.trim() : null,
      price || null,
      security_deposit || null,
      location || null,
      latitude || null,
      longitude || null,
      amenities || null,
      image_urls || null,
      id,
      virtual_tour_url === undefined ? null : virtual_tour_url,
    ];

    // Listing details: only columns that were sent are changed (a blank value clears them)
    const detailSets = Object.entries(details.values).map(([column, value]) => {
      values.push(value);
      return `${column} = $${values.length}`;
    });

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
          -- An empty string clears the tour; undefined leaves it unchanged
          virtual_tour_url = CASE WHEN $11::text IS NULL THEN virtual_tour_url ELSE NULLIF($11::text, '') END,
          ${detailSets.map((s) => `${s},`).join("\n          ")}
          updated_at = NOW()
      WHERE listing_id = $10
      RETURNING *;
    `;

    const result = await query(sql, values);
    const { ical_token, ical_import_url, ...listing } = result.rows[0];

    return res.status(200).json({
      message: "Listing updated successfully",
      listing,
    });
  } catch (err) {
    console.error("Error updating listing:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { updateListing };
