const bcrypt = require("bcryptjs");
const { query } = require("../../db");
const {
  validatePassword, validateEmail, validatePhone,
  validateName, collectErrors,
} = require("../../utils/validators");

const registerAdmin = async (req, res) => {
  try {
    const {
      name, email, phone, password, role
    } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Name, email, password and role are required." });
    }

    // ── Input validation ──
    const validation = collectErrors([
      validateName(name),
      validateEmail(email),
      validatePhone(phone),
      validatePassword(password),
    ]);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.errors[0], errors: validation.errors });
    }

    const existingUser = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await query(
      `INSERT INTO users (
        name, email, phone, password_hash, role,
        is_email_verified, verification_status, verified_at, verified_by
      ) VALUES ($1, $2, $3, $4, 'admin', TRUE, 'verified', NOW(), $5)
      RETURNING id, name, email, phone, role, created_at`,
      [name, email, phone, passwordHash, req.user.id]
    );

    const user = result.rows[0];


    return res.status(201).json({
      message: "Admin account created successfully!",
      user,
    });
  } catch (err) {
    console.error("Register admin error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

module.exports = registerAdmin;
