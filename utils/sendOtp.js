/**
 * Generate a random 6-digit OTP code.
 */
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send an OTP verification email using Brevo HTTP API.
 * @param {string} toEmail - Recipient email address
 * @param {string} otpCode - 6-digit OTP code
 * @param {string} userName - User's display name
 */
const sendOtp = async (toEmail, otpCode, userName = "User") => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.SMTP_EMAIL || "no-reply@yourdomain.com";

  if (!apiKey || apiKey === "your_brevo_api_key_here") {
    console.error("❌ BREVO_API_KEY is not defined or is invalid in environment variables.");
    return { success: false, error: "Missing BREVO_API_KEY" };
  }

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #1952c4, #3b82f6); padding: 32px 24px; text-align: center;">
        <h1 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 700; letter-spacing: -0.3px;">BoardingFinder</h1>
        <p style="color: rgba(255,255,255,0.85); font-size: 14px; margin: 8px 0 0;">Email Verification</p>
      </div>

      <!-- Body -->
      <div style="padding: 32px 24px;">
        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
          Hi <strong>${userName}</strong>,
        </p>
        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
          Please use the verification code below to confirm your email address. This code is valid for <strong>10 minutes</strong>.
        </p>

        <!-- OTP Box -->
        <div style="background: #f0f4f9; border: 2px dashed #1952c4; border-radius: 12px; padding: 20px; text-align: center; margin: 0 0 24px;">
          <div style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #1952c4; font-family: 'Courier New', monospace;">
            ${otpCode}
          </div>
        </div>

        <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin: 0 0 16px;">
          If you didn't create an account on BoardingFinder, you can safely ignore this email.
        </p>
      </div>

      <!-- Footer -->
      <div style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
          © ${new Date().getFullYear()} BoardingFinder. All rights reserved.
        </p>
      </div>
    </div>
  `;

  const payload = {
    sender: { name: "BoardingFinder", email: senderEmail },
    to: [{ email: toEmail, name: userName }],
    subject: "Verify Your BoardingFinder Account",
    htmlContent: htmlContent,
    textContent: `Hi ${userName},\n\nYour verification code is ${otpCode}. This code is valid for 10 minutes.\n\nIf you didn't create an account on BoardingFinder, you can safely ignore this email.`
  };

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Unknown Brevo API error");
    }

    console.log(`📧 OTP email sent via Brevo to ${toEmail}: ${data.messageId}`);
    return { success: true, messageId: data.messageId };
  } catch (error) {
    console.error("❌ Failed to send OTP email via Brevo:", error.message);
    // Don't throw — let registration succeed even if email fails
    return { success: false, error: error.message };
  }
};

module.exports = { generateOtp, sendOtp };
