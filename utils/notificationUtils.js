const { query } = require('../db');

/**
 * Creates a notification in the database for a specific user.
 * 
 * @param {number} userId - The ID of the user receiving the notification.
 * @param {string} type - The type of notification (e.g., 'booking_approved', 'message', 'payment_reminder', 'system_alert').
 * @param {string} title - The short title of the notification.
 * @param {string} message - The detailed message of the notification.
 * @param {string} link - The frontend URL path to redirect to when clicked (default '#').
 * @returns {Promise<Object>} The created notification object.
 */
async function createNotification(userId, type, title, message, link = '#') {
  try {
    const result = await query(
      `INSERT INTO notifications (user_id, type, title, message, link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, type, title, message, link]
    );
    return result.rows[0];
  } catch (error) {
    console.error("❌ Failed to create notification:", error);
    // Don't throw the error, as we don't want notification failures to crash the main user flows (like booking)
    return null;
  }
}

module.exports = {
  createNotification
};
