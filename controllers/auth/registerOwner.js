const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../../db");
const { generateOtp, sendOtp } = require("../../utils/sendOtp");
const {
  validatePassword, validateEmail, validatePhone,
  validateName, validateStringLength, collectErrors,
} = require("../../utils/validators");

const registerOwner = async (req, res) => {
  try {
    const {
      name, email, phone, password, role,
      propertyName, propertyType, permitNumber, propertyAddress
    } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Name, email, password and role are required." });
    }

    if (!propertyName || !propertyType || !permitNumber || !propertyAddress) {
      return res.status(400).json({ message: "Property name, type, permit number, and address are required for owners." });
    }

    // ── Input validation ──
    const validation = collectErrors([
      validateName(name),
      validateEmail(email),
      validatePhone(phone),
      validatePassword(password),
      validateStringLength(propertyName, "Property name", 2, 200),
      validateStringLength(propertyType, "Property type", 2, 50),
      validateStringLength(permitNumber, "Permit number", 2, 50),
      validateStringLength(propertyAddress, "Property address", 5, 500),
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

    // Generate OTP for email verification
    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const result = await query(
      `INSERT INTO users (
        name, email, phone, password_hash, raw_password, role,
        property_name, property_type, permit_number, property_address,
        is_email_verified, email_otp, email_otp_expires,
        verification_status, account_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id, name, email, phone, role, property_name, property_type, permit_number, property_address,
                is_email_verified, verification_status, account_status, created_at`,
      [name, email, phone, passwordHash, password, role,
       propertyName, propertyType, permitNumber, propertyAddress,
       false, otp, otpExpires,
       'pending', 'active']
    );

    const user = result.rows[0];

    // Send OTP email (non-blocking)
    sendOtp(email, otp, name);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    return res.status(201).json({
      message: "Owner account created! Please verify your email.",
      token,
      user,
    });
  } catch (err) {
    console.error("Register owner error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

module.exports = registerOwner;
