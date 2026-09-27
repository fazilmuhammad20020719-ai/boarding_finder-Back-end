const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { getCalendarBlocks, addCalendarBlock, removeCalendarBlock } = require("../controllers/calendar/calendarController");

// Protected routes (Owner only)
router.get("/:listingId", auth, getCalendarBlocks);
router.post("/:listingId/block", auth, addCalendarBlock);
router.delete("/:listingId/block/:blockId", auth, removeCalendarBlock);

module.exports = router;
