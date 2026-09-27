const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { 
  getMyProfile, 
  upsertProfile, 
  getPotentialMatches, 
  passProfile,
  sendConnectionRequest,
  getConnectionRequests,
  respondToConnectionRequest,
  getAcceptedConnections,
  disconnectRoommate
} = require("../controllers/roommateController");

// Get the current user's profile
router.get("/me", authMiddleware, getMyProfile);

// Create or update the current user's profile
router.post("/me", authMiddleware, upsertProfile);

// Get potential matches for the current user
router.get("/matches", authMiddleware, getPotentialMatches);

// Pass on a roommate profile
router.post("/pass", authMiddleware, passProfile);

// Connection routes
router.post("/connect", authMiddleware, sendConnectionRequest);
router.get("/connections/pending", authMiddleware, getConnectionRequests);
router.put("/connections/:connectionId/respond", authMiddleware, respondToConnectionRequest);
router.get("/connections/accepted", authMiddleware, getAcceptedConnections);
router.delete("/connections/:connectionId", authMiddleware, disconnectRoommate);

module.exports = router;
