const { query } = require("../../db");
const { validateComment } = require("../../utils/validators");
const { getReviewEligibility } = require("../../utils/reviewEligibility");

const addReview = async (req, res) => {
  try {
    const listingId = req.params.id;
    const userId = req.user.id;
    const { rating, comment, categories } = req.body;

    // Only students who actually stayed here may rate or review (see utils/reviewEligibility.js)
    const eligibility = await getReviewEligibility(listingId, req.user);
    if (!eligibility.canReview) {
      const status = eligibility.code === 'already_reviewed' ? 409 : 403;
      return res.status(status).json({ message: eligibility.reason, code: eligibility.code });
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
    if (err.code === "23505") { // unique (listing_id, user_id): a second, simultaneous submit
      return res.status(409).json({ message: "You have already reviewed this property.", code: "already_reviewed" });
    }
    console.error("Error adding review:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { addReview };
