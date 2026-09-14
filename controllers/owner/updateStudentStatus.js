const { query } = require("../../db");

/**
 * PUT /api/owner/students/:id/status
 * Owner can pause, reactivate, or remove a student's account access.
 * Body: { action: 'pause' | 'reactivate' | 'remove' }
 */
const updateStudentStatus = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const studentId = req.params.id;
    const { action } = req.body;

    if (!action || !['pause', 'reactivate', 'remove'].includes(action)) {
      return res.status(400).json({ message: "Action must be 'pause', 'reactivate', or 'remove'." });
    }

    // Verify this student is actually linked to the owner's property
    const linkCheck = await query(`
      SELECT b.booking_id
      FROM bookings b
      JOIN listings l ON l.listing_id = b.listing_id
      WHERE b.seeker_id = $1
        AND l.owner_id = $2
        AND b.status = 'approved'
      LIMIT 1
    `, [studentId, ownerId]);

    if (linkCheck.rows.length === 0) {
      return res.status(403).json({
        message: "You can only manage students who have approved bookings on your properties.",
      });
    }

    // Map action to account_status
    const statusMap = {
      pause: 'paused',
      reactivate: 'active',
      remove: 'removed',
    };

    const newStatus = statusMap[action];

    const result = await query(
      `UPDATE users
       SET account_status = $1,
           status_changed_by = $2,
           status_changed_at = NOW(),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, email, account_status`,
      [newStatus, ownerId, studentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Student not found." });
    }

    const actionMessages = {
      pause: `${result.rows[0].name}'s account has been paused.`,
      reactivate: `${result.rows[0].name}'s account has been reactivated.`,
      remove: `${result.rows[0].name}'s account access has been removed.`,
    };

    return res.status(200).json({
      message: actionMessages[action],
      student: result.rows[0],
    });
  } catch (err) {
    console.error("Update student status error:", err.message);
    return res.status(500).json({ message: "Server error." });
  }
};

module.exports = updateStudentStatus;
