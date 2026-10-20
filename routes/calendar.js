const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { getCalendarBlocks, addCalendarBlock, removeCalendarBlock } = require("../controllers/calendar/calendarController");
const { getIcalLink, exportIcal, importIcal } = require("../controllers/calendar/icalController");

// Public iCal feed (protected by a secret per-listing token; must be before /:listingId)
router.get("/ical/:listingId/:token.ics", exportIcal);

// Protected routes (Owner only)
router.get("/:listingId/ical-link", auth, getIcalLink);
router.post("/:listingId/ical-import", auth, importIcal);
router.get("/:listingId", auth, getCalendarBlocks);
router.post("/:listingId/block", auth, addCalendarBlock);
router.delete("/:listingId/block/:blockId", auth, removeCalendarBlock);

module.exports = router;
