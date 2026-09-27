const { query } = require("../../db");

const getListingById = async (req, res) => {
  try {
    const { id } = req.params;

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

    // Increment view count
    await query("UPDATE listings SET views = views + 1 WHERE listing_id = $1", [id]);

    // Fetch reviews for this listing
    const reviewsSql = `
      SELECT r.review_id as id, r.rating, r.comment as text, r.created_at, u.name as reviewer_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.listing_id = $1
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

    // Calculate average rating
    const avgRating = reviews.length > 0 
      ? (reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length).toFixed(1)
      : 0;

    return res.status(200).json({
      listing: {
        ...result.rows[0],
        reviews_data: reviews,
        avg_rating: avgRating,
        review_count: reviews.length
      },
    });
  } catch (err) {
    console.error("Error fetching listing:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getListingById };
