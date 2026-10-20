const express = require("express");
const auth = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimiter");
const { createTicket, getMyTickets, createContactMessage, createReport } = require("../controllers/tickets/userTickets");

const router = express.Router();

const contactLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Too many messages. Please try again later.",
});

const reportLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: "Too many reports. Please try again later.",
  keyGenerator: (req) => `report:${req.user?.id || req.ip}`,
});

router.post("/", auth, createTicket);
router.get("/my-tickets", auth, getMyTickets);
router.post("/contact", contactLimiter, createContactMessage);
router.post("/report", auth, reportLimiter, createReport);

module.exports = router;
