const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/auth");
const {
  getSavedListings,
  addSavedListing,
  removeSavedListing,
  checkSavedStatus,
} = require("../controllers/savedListingsController");

// All routes require authentication
router.use(verifyToken);

// GET /api/saved-listings
router.get("/", getSavedListings);

// POST /api/saved-listings
router.post("/", addSavedListing);

// DELETE /api/saved-listings/:listingId
router.delete("/:listingId", removeSavedListing);

// GET /api/saved-listings/check/:listingId
router.get("/check/:listingId", checkSavedStatus);

module.exports = router;
