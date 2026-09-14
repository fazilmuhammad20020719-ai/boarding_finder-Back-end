const { query } = require("../../db");
const { generateOtp, sendOtp } = require("../../utils/sendOtp");

const resendOtp = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user details
    const result = await query(
      "SELECT id, name, email, is_email_verified, email_otp_expires FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = result.rows[0];

    if (user.is_email_verified) {
      return res.status(400).json({ message: "Email is already verified." });
    }

    // Rate limit: don't allow resend if last OTP was sent less than 60 seconds ago
    if (user.email_otp_expires) {
      const lastSent = new Date(user.email_otp_expires).getTime() - 10 * 60 * 1000; // when it was created
      const now = Date.now();
      if (now - lastSent < 60 * 1000) {
        const waitSeconds = Math.ceil((60 * 1000 - (now - lastSent)) / 1000);
        return res.status(429).json({
          message: `Please wait ${waitSeconds} seconds before requesting a new code.`,
        });
      }
    }

    // Generate new OTP
    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await query(
      "UPDATE users SET email_otp = $1, email_otp_expires = $2, updated_at = NOW() WHERE id = $3",
      [otp, otpExpires, userId]
    );

    // Send email
    await sendOtp(user.email, otp, user.name);

    return res.status(200).json({
      message: "A new verification code has been sent to your email.",
    });
  } catch (err) {
    console.error("Resend OTP error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

module.exports = resendOtp;
