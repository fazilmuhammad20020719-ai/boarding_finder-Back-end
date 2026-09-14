const pool = require("../../db");

const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, account_status, verification_status, created_at 
       FROM users 
       ORDER BY created_at DESC`
    );

    res.status(200).json({ users: result.rows });
  } catch (err) {
    console.error("Error fetching all users:", err);
    res.status(500).json({ message: "Server error while fetching users" });
  }
};

module.exports = getAllUsers;
