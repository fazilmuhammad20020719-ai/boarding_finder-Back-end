const { query } = require("../../db");
const { validateComment } = require("../../utils/validators");

const addReview = async (req, res) => {
  try {
    const listingId = req.params.id;
    const userId = req.user.id;
    const { rating, comment } = req.body;

    if (req.user.role !== 'student') {
      return res.status(403).json({ message: "Only students can leave reviews." });
    }

    if (!rating || rating < 1 || rating > 5) {
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

    // Insert the review
    const sql = `
      INSERT INTO reviews (listing_id, user_id, rating, comment)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const result = await query(sql, [listingId, userId, rating, comment.trim()]);

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
