const pool = require("../db");

// Get all saved listings for a student
const getSavedListings = async (req, res) => {
  try {
    const userId = req.user.id; // From verifyToken middleware
    const { rows } = await pool.query(
      `SELECT l.*, s.saved_id, s.created_at as saved_at
       FROM saved_listings s
       JOIN listings l ON s.listing_id = l.listing_id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching saved listings:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Add a listing to saved
const addSavedListing = async (req, res) => {
  try {
    const userId = req.user.id;
    const { listing_id } = req.body;

    if (!listing_id) {
      return res.status(400).json({ message: "Listing ID is required" });
    }

    // Check if listing exists
    const listingCheck = await pool.query(
      "SELECT listing_id FROM listings WHERE listing_id = $1",
      [listing_id]
    );
    if (listingCheck.rows.length === 0) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Insert (ignoring if it already exists due to unique constraint, though we'll handle the error)
    const newSave = await pool.query(
      "INSERT INTO saved_listings (user_id, listing_id) VALUES ($1, $2) ON CONFLICT (user_id, listing_id) DO NOTHING RETURNING *",
      [userId, listing_id]
    );

    if (newSave.rows.length === 0) {
      return res.status(400).json({ message: "Listing is already saved" });
    }

    res.status(201).json({ message: "Listing saved successfully", savedListing: newSave.rows[0] });
  } catch (err) {
    console.error("Error saving listing:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Remove a listing from saved
const removeSavedListing = async (req, res) => {
  try {
    const userId = req.user.id;
    const { listingId } = req.params;

    const result = await pool.query(
      "DELETE FROM saved_listings WHERE user_id = $1 AND listing_id = $2 RETURNING *",
      [userId, listingId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Saved listing not found" });
    }

    res.json({ message: "Listing removed from saved successfully" });
  } catch (err) {
    console.error("Error removing saved listing:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Check if a listing is saved by the current user
const checkSavedStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { listingId } = req.params;

    const result = await pool.query(
      "SELECT * FROM saved_listings WHERE user_id = $1 AND listing_id = $2",
      [userId, listingId]
    );

    res.json({ isSaved: result.rows.length > 0 });
  } catch (err) {
    console.error("Error checking saved status:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getSavedListings,
  addSavedListing,
  removeSavedListing,
  checkSavedStatus,
};
