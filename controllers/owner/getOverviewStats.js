const { query } = require("../../db");

const getOverviewStats = async (req, res) => {
  try {
    const ownerId = req.user.id;

    // 1. Monthly Revenue
    const revSql = `
      SELECT COALESCE(SUM(total_amount), 0) as revenue
      FROM bookings
      WHERE owner_id = $1 AND status = 'approved'
      AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
    `;
    const revResult = await query(revSql, [ownerId]);
    const monthlyRevenue = Number(revResult.rows[0]?.revenue || 0);

    // 2. Occupancy (Total listings vs active approved bookings)
    const listingsCountSql = `SELECT COUNT(*) as total FROM listings WHERE owner_id = $1`;
    const listingsCountRes = await query(listingsCountSql, [ownerId]);
    const totalCapacity = Number(listingsCountRes.rows[0]?.total || 0) * 2; // Assuming ~2 beds per listing for capacity mock if no beds column exists

    const occupiedSql = `
      SELECT COUNT(*) as occupied
      FROM bookings
      WHERE owner_id = $1 AND status = 'approved'
    `;
    const occupiedRes = await query(occupiedSql, [ownerId]);
    const occupied = Number(occupiedRes.rows[0]?.occupied || 0);
    const occupancyRate = totalCapacity > 0 ? Math.round((occupied / totalCapacity) * 100) : 0;

    // 3. Average Rating and Reviews
    const reviewsSql = `
      SELECT COALESCE(AVG(rating), 0) as avg_rating, COUNT(review_id) as total_reviews
      FROM reviews r
      JOIN listings l ON r.listing_id = l.listing_id
      WHERE l.owner_id = $1
    `;
    let avgRating = 0;
    let totalReviews = 0;
    try {
      const reviewsRes = await query(reviewsSql, [ownerId]);
      avgRating = Number(reviewsRes.rows[0]?.avg_rating || 0).toFixed(1);
      totalReviews = Number(reviewsRes.rows[0]?.total_reviews || 0);
    } catch (e) {
      // Reviews table might not exist yet if migrations failed, safely ignore
      console.warn("Reviews table missing or error:", e.message);
    }

    // 4. Inquiries & Pending Requests
    const pendingSql = `
      SELECT b.booking_id, b.move_in_date, b.duration_months, u.name as seeker_name, u.email as seeker_email, l.title as listing_title, u.name as initial
      FROM bookings b
      JOIN users u ON b.seeker_id = u.id
      JOIN listings l ON b.listing_id = l.listing_id
      WHERE b.owner_id = $1 AND b.status = 'pending'
      ORDER BY b.created_at DESC
    `;
    const pendingRes = await query(pendingSql, [ownerId]);
    const pendingRequests = pendingRes.rows;
    const unanswered = pendingRequests.length;
    const totalInquiries = unanswered + occupied; // Simple mock for total inquiries based on bookings + pending

    // 5. Revenue Chart (Last 6 Months)
    const chartSql = `
      SELECT TO_CHAR(created_at, 'Mon') as month, EXTRACT(MONTH FROM created_at) as month_num, SUM(total_amount) as revenue
      FROM bookings
      WHERE owner_id = $1 AND status = 'approved'
        AND created_at >= NOW() - INTERVAL '5 months'
      GROUP BY TO_CHAR(created_at, 'Mon'), EXTRACT(MONTH FROM created_at)
      ORDER BY month_num
    `;
    const chartRes = await query(chartSql, [ownerId]);
    
    // Fill in last 6 months even if empty
    const months = [];
    const chartData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthStr = d.toLocaleString('default', { month: 'short' });
      const found = chartRes.rows.find(r => r.month === monthStr);
      chartData.push({
        month: monthStr,
        revenue: found ? Number(found.revenue) : 0
      });
    }

    return res.status(200).json({
      stats: {
        monthlyRevenue,
        occupancy: {
          occupied,
          total: totalCapacity > 0 ? totalCapacity : 5, // Fallback to 5 if owner has no listings so UI doesn't look broken
          rate: occupancyRate
        },
        reviews: {
          average: avgRating,
          count: totalReviews
        },
        inquiries: {
          total: totalInquiries,
          unanswered: unanswered
        },
        chartData,
        pendingRequests
      }
    });

  } catch (err) {
    console.error("Error fetching overview stats:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getOverviewStats };
