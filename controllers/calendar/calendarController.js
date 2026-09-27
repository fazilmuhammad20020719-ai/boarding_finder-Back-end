const { query } = require("../../db");

// Get calendar blocks for a listing
const getCalendarBlocks = async (req, res) => {
  try {
    const { listingId } = req.params;
    const safeListingId = parseInt(listingId, 10);
    const userId = parseInt(req.user.id, 10);

    // Verify ownership
    const listingCheck = await query("SELECT owner_id FROM listings WHERE listing_id = $1", [safeListingId]);
    if (listingCheck.rows.length === 0) {
      return res.status(404).json({ error: "Listing not found" });
    }
    
    // Allow owner or admin or maybe anyone if we only show dates? We'll restrict to owner for management
    if (listingCheck.rows[0].owner_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get manual blocks
    const manualBlocksResult = await query(
      "SELECT id, start_date, end_date, reason FROM calendar_blocks WHERE listing_id = $1 ORDER BY start_date ASC",
      [safeListingId]
    );

    // Get approved bookings that block dates
    // A booking blocks dates from move_in_date up to (move_in_date + duration_months)
    // We can compute the end date in JS or SQL. Let's do SQL.
    const bookingBlocksResult = await query(
      `SELECT booking_id as id, 
              move_in_date as start_date, 
              (move_in_date + (duration_months || ' months')::interval)::date as end_date, 
              'booking' as reason 
       FROM bookings 
       WHERE listing_id = $1 AND status = 'approved'
       ORDER BY move_in_date ASC`,
      [safeListingId]
    );

    const manualBlocks = manualBlocksResult.rows;
    const bookingBlocks = bookingBlocksResult.rows;

    const allBlocks = [...manualBlocks, ...bookingBlocks].sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

    res.status(200).json({
      blocks: allBlocks
    });

  } catch (err) {
    console.error("Error getting calendar blocks:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// Add a manual calendar block
const addCalendarBlock = async (req, res) => {
  try {
    const { listingId } = req.params;
    const { start_date, end_date } = req.body;
    const safeListingId = parseInt(listingId, 10);
    const userId = parseInt(req.user.id, 10);

    if (!start_date || !end_date) {
      return res.status(400).json({ error: "start_date and end_date are required" });
    }

    // Verify ownership
    const listingCheck = await query("SELECT owner_id FROM listings WHERE listing_id = $1", [safeListingId]);
    if (listingCheck.rows.length === 0) {
      return res.status(404).json({ error: "Listing not found" });
    }
    
    if (listingCheck.rows[0].owner_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied" });
    }

    const newBlockResult = await query(
      "INSERT INTO calendar_blocks (listing_id, start_date, end_date, reason) VALUES ($1, $2, $3, $4) RETURNING *",
      [safeListingId, start_date, end_date, 'manual']
    );

    res.status(201).json({
      message: "Dates blocked successfully",
      block: newBlockResult.rows[0]
    });

  } catch (err) {
    console.error("Error adding calendar block:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// Remove a manual calendar block
const removeCalendarBlock = async (req, res) => {
  try {
    const { listingId, blockId } = req.params;
    const safeListingId = parseInt(listingId, 10);
    const safeBlockId = parseInt(blockId, 10);
    const userId = parseInt(req.user.id, 10);

    // Verify ownership
    const listingCheck = await query("SELECT owner_id FROM listings WHERE listing_id = $1", [safeListingId]);
    if (listingCheck.rows.length === 0) {
      return res.status(404).json({ error: "Listing not found" });
    }
    
    if (listingCheck.rows[0].owner_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied" });
    }

    const deleteResult = await query(
      "DELETE FROM calendar_blocks WHERE id = $1 AND listing_id = $2 RETURNING id",
      [safeBlockId, safeListingId]
    );

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ error: "Block not found" });
    }

    res.status(200).json({ message: "Dates unblocked successfully" });

  } catch (err) {
    console.error("Error removing calendar block:", err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  getCalendarBlocks,
  addCalendarBlock,
  removeCalendarBlock
};
