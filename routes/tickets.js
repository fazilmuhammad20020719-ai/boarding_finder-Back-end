const express = require("express");
const auth = require("../middleware/auth");
const { createTicket, getMyTickets } = require("../controllers/tickets/userTickets");

const router = express.Router();

router.post("/", auth, createTicket);
router.get("/my-tickets", auth, getMyTickets);

module.exports = router;
