const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const auth = require("../middleware/auth");

const { createListing } = require("../controllers/listings/createListing");
const { getAllListings } = require("../controllers/listings/getAllListings");
const { getListingById } = require("../controllers/listings/getListingById");
const { updateListing } = require("../controllers/listings/updateListing");
const { deleteListing } = require("../controllers/listings/deleteListing");
const { getMyListings } = require("../controllers/listings/getMyListings");
const { uploadPhotos } = require("../controllers/listings/upload");
const { addReview } = require("../controllers/listings/addReview");
const { getNeighborhoodDetails } = require("../controllers/listings/getNeighborhoodDetails");
const { pauseListing } = require("../controllers/listings/pauseListing");
const { duplicateListing } = require("../controllers/listings/duplicateListing");
const { getListingAnalytics } = require("../controllers/listings/getListingAnalytics");

const { getStats } = require("../controllers/listings/getStats");

// ─── Multer Configuration ────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_TEMP_DIR || "/tmp/boarding-uploads";
    if (!require("fs").existsSync(uploadDir)) {
      require("fs").mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Final name/extension is assigned after magic-byte validation
    cb(null, require("crypto").randomUUID());
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
  fileFilter: (req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG and WebP images are allowed."));
    }
  },
});

// Public routes
router.get("/public/stats", getStats);
router.get("/", getAllListings);

// Protected routes (Owner only)
router.get("/owner/mine", auth, getMyListings);

// Photo upload route (must be before /:id to avoid conflict)
router.post("/upload", auth, upload.array("photos", 5), uploadPhotos);

// Public route for specific ID
router.get("/:id", getListingById);
router.get("/:id/neighborhood", getNeighborhoodDetails);

// Protected routes (Owner only)
router.post("/", auth, createListing);
router.put("/:id", auth, updateListing);
router.delete("/:id", auth, deleteListing);
router.put("/:id/pause", auth, pauseListing);
router.post("/:id/duplicate", auth, duplicateListing);
router.get("/:id/analytics", auth, getListingAnalytics);

// Protected routes (Any logged in user can review)
router.post("/:id/reviews", auth, addReview);

module.exports = router;
