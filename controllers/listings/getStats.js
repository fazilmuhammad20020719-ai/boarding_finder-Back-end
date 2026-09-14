const { query } = require("../../db");

const getStats = async (req, res) => {
  try {
    // 1. Active Listings
    const listingsResult = await query("SELECT COUNT(*) FROM listings");
    const activeListings = parseInt(listingsResult.rows[0].count, 10);

    // 2. Partner Universities (distinct universities)
    const uniResult = await query("SELECT COUNT(DISTINCT university) FROM listings WHERE university IS NOT NULL AND university != ''");
    const partnerUniversities = parseInt(uniResult.rows[0].count, 10);

    // 3. Students Placed (approved bookings)
    const bookingsResult = await query("SELECT COUNT(*) FROM bookings WHERE status = 'approved'");
    const studentsPlaced = parseInt(bookingsResult.rows[0].count, 10);

    // 4. Average Rating
    const ratingsResult = await query("SELECT AVG(rating) FROM reviews");
    const avgRating = parseFloat(ratingsResult.rows[0].avg) || 0;

    return res.status(200).json({
      stats: {
        activeListings,
        partnerUniversities,
        studentsPlaced,
        avgRating: avgRating.toFixed(1)
      }
    });
  } catch (err) {
    console.error("Error fetching stats:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getStats };
