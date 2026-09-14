const { query } = require("../../db");

/**
 * GET /api/admin/verification-stats
 * Returns counts of users by verification status.
 */
const getVerificationStats = async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE verification_status = 'pending' AND verification_docs IS NOT NULL AND array_length(verification_docs, 1) > 0) AS pending,
        COUNT(*) FILTER (WHERE verification_status = 'verified') AS verified,
        COUNT(*) FILTER (WHERE verification_status = 'rejected') AS rejected,
        COUNT(*) FILTER (WHERE verification_status = 'pending' AND (verification_docs IS NULL OR array_length(verification_docs, 1) IS NULL)) AS awaiting_docs,
        COUNT(*) AS total
      FROM users
      WHERE role != 'admin'
    `);

    return res.status(200).json({
      stats: result.rows[0],
    });
  } catch (err) {
    console.error("Verification stats error:", err.message);
    return res.status(500).json({ message: "Server error." });
  }
};

module.exports = getVerificationStats;
