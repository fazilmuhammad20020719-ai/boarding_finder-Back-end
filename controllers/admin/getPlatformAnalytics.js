const pool = require("../../db");

const getPlatformAnalytics = async (req, res) => {
  try {
    // We will use Promise.all to run all analytical queries concurrently for performance
    const [
      usersResult,
      listingsResult,
      bookingsResult,
      reviewsResult
    ] = await Promise.all([
      // User Metrics
      pool.query(`
        SELECT 
          COUNT(*) as total_users,
          SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) as total_students,
          SUM(CASE WHEN role = 'owner' THEN 1 ELSE 0 END) as total_owners,
          SUM(CASE WHEN account_status = 'active' THEN 1 ELSE 0 END) as active_users,
          SUM(CASE WHEN account_status = 'paused' THEN 1 ELSE 0 END) as suspended_users
        FROM users 
        WHERE role != 'admin'
      `),
      
      // Listing Metrics
      pool.query(`
        SELECT 
          COUNT(*) as total_listings,
          SUM(CASE WHEN approval_status = 'approved' OR approval_status IS NULL THEN 1 ELSE 0 END) as approved_listings,
          SUM(CASE WHEN approval_status = 'pending' THEN 1 ELSE 0 END) as pending_listings,
          SUM(CASE WHEN approval_status = 'rejected' THEN 1 ELSE 0 END) as rejected_listings
        FROM listings
      `),

      // Booking & Revenue Metrics
      pool.query(`
        SELECT 
          COUNT(*) as total_bookings,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_bookings,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_bookings,
          SUM(CASE WHEN status = 'rejected' OR status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_bookings,
          COALESCE(SUM(CASE WHEN status = 'approved' THEN total_amount ELSE 0 END), 0) as total_revenue
        FROM bookings
      `),

      // Review Metrics
      pool.query(`
        SELECT 
          COUNT(*) as total_reviews,
          COALESCE(AVG(rating), 0) as average_rating
        FROM reviews
      `)
    ]);

    const userStats = usersResult.rows[0];
    const listingStats = listingsResult.rows[0];
    const bookingStats = bookingsResult.rows[0];
    const reviewStats = reviewsResult.rows[0];

    // Assuming a 5% platform fee for analytics visualization purposes
    const platformFeePercentage = 0.05;
    const totalRevenue = parseFloat(bookingStats.total_revenue);
    const platformRevenue = totalRevenue * platformFeePercentage;

    res.status(200).json({
      analytics: {
        users: {
          total: parseInt(userStats.total_users || 0),
          students: parseInt(userStats.total_students || 0),
          owners: parseInt(userStats.total_owners || 0),
          active: parseInt(userStats.active_users || 0),
          suspended: parseInt(userStats.suspended_users || 0),
        },
        listings: {
          total: parseInt(listingStats.total_listings || 0),
          approved: parseInt(listingStats.approved_listings || 0),
          pending: parseInt(listingStats.pending_listings || 0),
          rejected: parseInt(listingStats.rejected_listings || 0),
        },
        bookings: {
          total: parseInt(bookingStats.total_bookings || 0),
          approved: parseInt(bookingStats.approved_bookings || 0),
          pending: parseInt(bookingStats.pending_bookings || 0),
          cancelled: parseInt(bookingStats.cancelled_bookings || 0),
        },
        revenue: {
          totalGross: totalRevenue,
          platformNet: platformRevenue,
        },
        reviews: {
          total: parseInt(reviewStats.total_reviews || 0),
          averageRating: parseFloat(reviewStats.average_rating || 0).toFixed(1)
        }
      }
    });

  } catch (err) {
    console.error("Error fetching platform analytics:", err);
    res.status(500).json({ message: "Server error while fetching analytics data" });
  }
};

module.exports = { getPlatformAnalytics };
