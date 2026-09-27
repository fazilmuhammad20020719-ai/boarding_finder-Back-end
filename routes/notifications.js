const express = require('express');
const router = express.Router();
const { query } = require('../db');
const auth = require('../middleware/auth');

// 1. Get all notifications for the authenticated user
router.get('/', auth, async (req, res) => {
  try {
    const user_id = req.user.id;
    const result = await query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [user_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// 2. Mark a single notification as read
router.put('/:id/read', auth, async (req, res) => {
  try {
    const user_id = req.user.id;
    const notification_id = req.params.id;

    const result = await query(
      `UPDATE notifications 
       SET is_read = TRUE 
       WHERE id = $1 AND user_id = $2 
       RETURNING *`,
      [notification_id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Notification not found or unauthorized" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// 3. Mark all notifications as read for the authenticated user
router.put('/read-all', auth, async (req, res) => {
  try {
    const user_id = req.user.id;
    await query(
      `UPDATE notifications 
       SET is_read = TRUE 
       WHERE user_id = $1`,
      [user_id]
    );
    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// 4. Delete a single notification
router.delete('/:id', auth, async (req, res) => {
  try {
    const user_id = req.user.id;
    const notification_id = req.params.id;

    const result = await query(
      `DELETE FROM notifications 
       WHERE id = $1 AND user_id = $2 
       RETURNING *`,
      [notification_id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Notification not found or unauthorized" });
    }

    res.json({ message: "Notification deleted successfully" });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
