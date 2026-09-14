const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { getConversations, getMessages, sendMessage, markAsRead } = require("../controllers/messagesController");

// Protect all messaging routes
router.use(auth);

router.get("/conversations", getConversations);
router.get("/:conversationId", getMessages);
router.post("/", sendMessage);
router.put("/:conversationId/read", markAsRead);

module.exports = router;
