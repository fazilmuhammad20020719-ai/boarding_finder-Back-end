const { query } = require("../../db");
const { parsePagination, paginated, escapeLike } = require("../../utils/pagination");

const getAllListings = async (req, res) => {
  try {
    const page = parsePagination(req, { defaultLimit: 100, maxLimit: 200 });

    // Optional filters: ?q= (title/location/university), ?minPrice=, ?maxPrice=
    const params = [];
    const filters = [];
    const q = String(req.query.q || "").trim().slice(0, 100);
    if (q) {
      params.push(`%${escapeLike(q)}%`);
      filters.push(`(l.title ILIKE $${params.length} OR l.location ILIKE $${params.length} OR l.university ILIKE $${params.length})`);
    }
    const minPrice = Number(req.query.minPrice);
    const maxPrice = Number(req.query.maxPrice);
    if (req.query.minPrice !== undefined && Number.isFinite(minPrice) && minPrice >= 0) {
      params.push(minPrice);
      filters.push(`l.price >= $${params.length}`);
    }
    if (req.query.maxPrice !== undefined && Number.isFinite(maxPrice) && maxPrice >= 0) {
      params.push(maxPrice);
      filters.push(`l.price <= $${params.length}`);
    }
    params.push(page.limit, page.offset);

    const sql = `
      SELECT l.*, u.name as owner_name, u.email as owner_email,
             COUNT(*) OVER() AS total_count,
             promo.plan_id AS promotion_plan,
             (promo.plan_id IS NOT NULL) AS is_promoted
      FROM listings l
      JOIN users u ON l.owner_id = u.id
      LEFT JOIN LATERAL (
        SELECT p.plan_id FROM promoted_listings p
        WHERE p.listing_id = l.listing_id AND NOW() BETWEEN p.starts_at AND p.ends_at
        ORDER BY p.ends_at DESC LIMIT 1
      ) promo ON TRUE
      WHERE (l.approval_status = 'approved' OR l.approval_status IS NULL)
        AND COALESCE(l.is_paused, FALSE) = FALSE
        ${filters.map((f) => `AND ${f}`).join(" ")}
      ORDER BY
        CASE promo.plan_id WHEN 'ultimate' THEN 3 WHEN 'premium' THEN 2 WHEN 'basic' THEN 1 ELSE 0 END DESC,
        l.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length};
    `;
    const result = await query(sql, params);

    // Never expose the secret calendar feed token publicly
    const rows = result.rows.map(({ ical_token, ical_import_url, ...listing }) => listing);
    return res.status(200).json(paginated("listings", rows, page));
  } catch (err) {
    console.error("Error fetching listings:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getAllListings };
