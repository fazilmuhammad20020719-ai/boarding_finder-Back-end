const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../../db");
const { generateOtp, sendOtp } = require("../../utils/sendOtp");

const registerStudent = async (req, res) => {
  try {
    const {
      name, email, phone, password, role,
      university, course, studentId
    } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Name, email, password and role are required." });
    }

    if (!university || !course || !studentId) {
      return res.status(400).json({ message: "University, course, and student ID are required for students." });
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
        university, course, student_id,
        is_email_verified, email_otp, email_otp_expires,
        verification_status, account_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id, name, email, phone, role, university, course, student_id,
                is_email_verified, verification_status, account_status, created_at`,
      [name, email, phone, passwordHash, password, role,
       university, course, studentId,
       false, otp, otpExpires,
       'pending', 'active']
    );

    const user = result.rows[0];

    // Send OTP email (non-blocking — don't fail registration if email fails)
    sendOtp(email, otp, name);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    return res.status(201).json({
      message: "Student account created! Please verify your email.",
      token,
      user,
    });
  } catch (err) {
    console.error("Register student error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

module.exports = registerStudent;
