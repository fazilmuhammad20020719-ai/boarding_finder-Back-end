const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../../db");

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    // --- Find user by email ---
    const result = await query(
      `SELECT id, name, email, phone, password_hash, role,
              university, course, student_id,
              property_name, property_type, permit_number, property_address,
              is_email_verified, verification_status, verification_docs,
              account_status, created_at
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const user = result.rows[0];

    // --- Compare password ---
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    // --- Check account status (owner management controls) ---
    if (user.account_status === 'paused') {
      return res.status(403).json({
        message: "Your account has been temporarily paused by the property owner. Please contact them for more information.",
        account_status: 'paused'
      });
    }
    if (user.account_status === 'removed') {
      return res.status(403).json({
        message: "Your account access has been removed. Please contact support.",
        account_status: 'removed'
      });
    }

    // --- Generate JWT ---
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    // Remove password_hash before sending
    const { password_hash, ...userWithoutPassword } = user;

    return res.status(200).json({
      message: "Login successful!",
      token,
      user: userWithoutPassword,
    });
  } catch (err) {
    console.error("Login error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

module.exports = login;
