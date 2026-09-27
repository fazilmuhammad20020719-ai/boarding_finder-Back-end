const { query } = require("../../db");

const getListingAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const owner_id = req.user.id;

    // Verify ownership
    const listingRes = await query("SELECT owner_id, views FROM listings WHERE listing_id = $1", [id]);
    if (listingRes.rows.length === 0) {
      return res.status(404).json({ message: "Listing not found" });
    }

    if (listingRes.rows[0].owner_id !== owner_id && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Get views
    const views = listingRes.rows[0].views || 0;

    // Get inquiries (number of unique conversations)
    const inquiriesRes = await query(
      "SELECT COUNT(*) FROM conversations WHERE listing_id = $1",
      [id]
    );
    const inquiries = parseInt(inquiriesRes.rows[0].count, 10);

    // Get bookings (number of bookings made for this listing)
    const bookingsRes = await query(
      "SELECT COUNT(*) FROM bookings WHERE listing_id = $1",
      [id]
    );
    const bookingsCount = parseInt(bookingsRes.rows[0].count, 10);

    // Additionally get total revenue generated if needed, but for now simple counts
    const revenueRes = await query(
      "SELECT SUM(total_amount) FROM bookings WHERE listing_id = $1 AND status = 'approved'",
      [id]
    );
    const revenue = revenueRes.rows[0].sum || 0;

    res.status(200).json({
      analytics: {
        views,
        inquiries,
        bookings: bookingsCount,
        revenue
      }
    });
  } catch (err) {
    console.error("Error fetching listing analytics:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getListingAnalytics };
