const pool = require("../../db");

const updateUserStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['active', 'paused', 'removed'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid status value provided." });
  }

  try {
    const result = await pool.query(
      `UPDATE users 
       SET account_status = $1, status_changed_by = $2, status_changed_at = NOW(), updated_at = NOW() 
       WHERE id = $3 
       RETURNING id, name, email, role, account_status`,
      [status, req.user.id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({ 
      message: "User status updated successfully", 
      user: result.rows[0] 
    });
  } catch (err) {
    console.error("Error updating user status:", err);
    res.status(500).json({ message: "Server error while updating user status" });
  }
};

module.exports = updateUserStatus;
