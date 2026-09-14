const pool = require("../../db");

const updateUserRole = async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  const validRoles = ['student', 'owner', 'admin'];

  if (!validRoles.includes(role)) {
    return res.status(400).json({ message: "Invalid role value provided." });
  }

  // Prevent admin from accidentally changing their own role and locking themselves out
  if (req.user.id.toString() === id.toString()) {
    return res.status(403).json({ message: "You cannot change your own role." });
  }

  try {
    const result = await pool.query(
      `UPDATE users 
       SET role = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING id, name, email, role, account_status`,
      [role, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({ 
      message: "User role updated successfully", 
      user: result.rows[0] 
    });
  } catch (err) {
    console.error("Error updating user role:", err);
    res.status(500).json({ message: "Server error while updating user role" });
  }
};

module.exports = updateUserRole;
