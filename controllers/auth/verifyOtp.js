const { query } = require("../../db");

const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const userId = req.user.id;

    if (!otp || otp.length !== 6) {
      return res.status(400).json({ message: "Please enter a valid 6-digit OTP code." });
    }

    // Get user's stored OTP
    const result = await query(
      "SELECT email_otp, email_otp_expires, is_email_verified FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = result.rows[0];

    if (user.is_email_verified) {
      return res.status(400).json({ message: "Email is already verified." });
    }

    if (!user.email_otp) {
      return res.status(400).json({ message: "No OTP found. Please request a new one." });
    }

    // Check if OTP has expired
    if (new Date() > new Date(user.email_otp_expires)) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    // Check if OTP matches
    if (user.email_otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP code. Please try again." });
    }

    // Mark email as verified and clear OTP
    const updated = await query(
      `UPDATE users
       SET is_email_verified = TRUE,
           email_otp = NULL,
           email_otp_expires = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, email, phone, role,
                 is_email_verified, verification_status, verification_docs,
                 account_status`,
      [userId]
    );

    return res.status(200).json({
      message: "Email verified successfully!",
      user: updated.rows[0],
    });
  } catch (err) {
    console.error("Verify OTP error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

module.exports = verifyOtp;
