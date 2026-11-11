const { query } = require("../../db");
const { getReviewEligibility } = require("../../utils/reviewEligibility");

const getListingById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^\d+$/.test(String(id))) {
      return res.status(404).json({ message: "Listing not found" });
    }

    const sql = `
      SELECT l.*, u.name as owner_name, u.email as owner_email, u.phone as owner_phone
      FROM listings l
      JOIN users u ON l.owner_id = u.id
      WHERE l.listing_id = $1;
    `;
    const result = await query(sql, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Listing not found" });
    }

    const row = result.rows[0];
    const viewer = req.user; // set by optionalAuth when signed in
    const isOwner = viewer && viewer.id === row.owner_id;
    const isAdmin = viewer && viewer.role === "admin";
    const isPublic = (row.approval_status === "approved" || row.approval_status == null) && !row.is_paused;

    // Paused / pending / rejected / suspended listings are visible only to their owner and admins
    if (!isPublic && !isOwner && !isAdmin) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Count views from other people only
    if (!isOwner) {
      await query("UPDATE listings SET views = views + 1 WHERE listing_id = $1", [id]);
    }

    // Only approved reviews are shown publicly
    const reviewsSql = `
      SELECT r.review_id as id, r.rating, r.comment as text, r.created_at, u.name as reviewer_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.listing_id = $1 AND COALESCE(r.status, 'approved') = 'approved'
      ORDER BY r.created_at DESC;
    `;
    const reviewsResult = await query(reviewsSql, [id]);
    const reviews = reviewsResult.rows.map(r => ({
      id: r.id,
      name: r.reviewer_name,
      initial: r.reviewer_name.charAt(0).toUpperCase(),
      date: new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      rating: r.rating,
      text: r.text
    }));

    const avgRating = reviews.length > 0
      ? (reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length).toFixed(1)
      : 0;

    // Whether THIS viewer may rate/review the room (reviews themselves are public)
    const reviewPermission = await getReviewEligibility(id, viewer);

    // Never expose the secret calendar feed token publicly;
    // owner contact details only go to signed-in users.
    const { ical_token, ical_import_url, owner_email, owner_phone, ...listing } = row;

    return res.status(200).json({
      listing: {
        ...listing,
        ...(viewer ? { owner_email, owner_phone } : {}),
        reviews_data: reviews,
        avg_rating: avgRating,
        review_count: reviews.length,
        review_permission: reviewPermission,
      },
    });
  } catch (err) {
    console.error("Error fetching listing:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getListingById };
