const { query } = require("../../db");
const { validateComment } = require("../../utils/validators");

const addReview = async (req, res) => {
  try {
    const listingId = req.params.id;
    const userId = req.user.id;
    const { rating, comment, categories } = req.body;

    if (req.user.role !== 'student') {
      return res.status(403).json({ message: "Only students can leave reviews." });
    }

    if (!Number.isInteger(Number(rating)) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5." });
    }

    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({ message: "Comment is required." });
    }

    // ── Input validation ──
    const commentCheck = validateComment(comment);
    if (!commentCheck.valid) {
      return res.status(400).json({ message: commentCheck.message });
    }

    // Only students with an approved/completed stay at this property may review it
    const stay = await query(
      `SELECT 1 FROM bookings
       WHERE listing_id = $1 AND seeker_id = $2 AND status IN ('approved', 'completed')
       LIMIT 1`,
      [listingId, userId]
    );
    if (stay.rows.length === 0) {
      return res.status(403).json({ message: "You can only review properties you have stayed at." });
    }

    const existing = await query(
      "SELECT 1 FROM reviews WHERE listing_id = $1 AND user_id = $2",
      [listingId, userId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "You have already reviewed this property." });
    }

    // Optional per-category scores (1–5); unknown keys are dropped
    const CATEGORY_KEYS = ["cleanliness", "location", "facilities", "value"];
    const categoryRatings = {};
    for (const key of CATEGORY_KEYS) {
      const value = Number(categories?.[key]);
      if (Number.isInteger(value) && value >= 1 && value <= 5) categoryRatings[key] = value;
    }

    // Insert the review
    const sql = `
      INSERT INTO reviews (listing_id, user_id, rating, comment, category_ratings)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const result = await query(sql, [listingId, userId, Number(rating), comment.trim(), categoryRatings]);

    return res.status(201).json({
      message: "Review added successfully",
      review: result.rows[0],
    });
  } catch (err) {
    console.error("Error adding review:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { addReview };
