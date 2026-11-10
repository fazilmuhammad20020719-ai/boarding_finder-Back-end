const { query } = require("../../db");
const { createNotification } = require("../../utils/notificationUtils");

/**
 * PUT /api/admin/users/:id/verify
 * Admin approves or rejects a user's verification.
 * Body: { action: 'approve' | 'reject', note?: string }
 */
const verifyUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, note } = req.body;
    const adminId = req.user.id;

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: "Action must be 'approve' or 'reject'." });
    }

    // Check user exists
    const userResult = await query("SELECT id, name, email, role, verification_status FROM users WHERE id = $1", [id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const targetUser = userResult.rows[0];

    if (action === 'approve') {
      const result = await query(
        `UPDATE users
         SET verification_status = 'verified',
             verified_at = NOW(),
             verified_by = $1,
             verification_note = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING id, name, email, role, verification_status, verified_at`,
        [adminId, note || null, id]
      );

      // In-app + email notification (delivery failures never block the response)
      await createNotification(
        targetUser.id,
        'account_verified',
        "Your account has been verified",
        "Good news! An admin has reviewed your documents and verified your BoardingFinder account. You now have full access.",
        targetUser.role === 'owner' ? '/owner-dashboard' : '/home'
      );

      return res.status(200).json({
        message: `${targetUser.name}'s account has been verified successfully.`,
        user: result.rows[0],
      });
    } else {
      // Reject
      if (!note) {
        return res.status(400).json({ message: "A rejection reason is required." });
      }

      const result = await query(
        `UPDATE users
         SET verification_status = 'rejected',
             verification_note = $1,
             verified_by = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING id, name, email, role, verification_status, verification_note`,
        [note, adminId, id]
      );

      await createNotification(
        targetUser.id,
        'account_rejected',
        "Your verification documents were not accepted",
        `An admin reviewed your documents and could not verify your account. Reason: ${String(note).slice(0, 500)}. Please upload new documents to try again.`,
        '/identity-verification'
      );

      return res.status(200).json({
        message: `${targetUser.name}'s verification has been rejected.`,
        user: result.rows[0],
      });
    }
  } catch (err) {
    console.error("Verify user error:", err.message);
    return res.status(500).json({ message: "Server error." });
  }
};

module.exports = verifyUser;
