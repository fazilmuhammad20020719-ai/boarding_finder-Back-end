const { query } = require('../db');
const { emitToUser } = require('./realtime');
const { sendEmail } = require('./sendOtp');

// Notification types that are also delivered by email
const EMAIL_TYPES = new Set(['booking_request', 'booking_approved', 'booking_rejected', 'payment_received', 'payment_receipt',
  'account_verified', 'account_rejected']);
// Urgent types that are also sent by SMS (only when Twilio is configured)
const SMS_TYPES = new Set(['booking_request']);

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

async function sendNotificationEmail(user, title, message, link) {
  const url = link && link !== '#' ? `${frontendUrl()}${link}` : frontendUrl();
  return sendEmail({
    sender: { name: 'BoardingFinder', email: process.env.SMTP_EMAIL || 'no-reply@yourdomain.com' },
    to: [{ email: user.email, name: user.name }],
    subject: title,
    htmlContent: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
        <div style="background: linear-gradient(135deg, #1952c4, #3b82f6); padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; font-size: 20px; margin: 0;">BoardingFinder</h1>
        </div>
        <div style="padding: 28px 24px;">
          <p style="color: #334155; font-size: 15px; margin: 0 0 12px;">Hi <strong>${escapeHtml(user.name)}</strong>,</p>
          <h2 style="color: #0f172a; font-size: 17px; margin: 0 0 8px;">${escapeHtml(title)}</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">${escapeHtml(message)}</p>
          <a href="${escapeHtml(url)}" style="display: inline-block; background: #1952c4; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 10px; font-weight: 700;">Open BoardingFinder</a>
        </div>
      </div>`,
    textContent: `Hi ${user.name},\n\n${title}\n${message}\n\n${url}`,
  });
}

// Convert local numbers (e.g. 0771234567) to E.164 using SMS_DEFAULT_COUNTRY_CODE (default 94, Sri Lanka)
const toE164 = (phone) => {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return `+${process.env.SMS_DEFAULT_COUNTRY_CODE || '94'}${digits.slice(1)}`;
  return digits ? `+${digits}` : null;
};

/** Send an SMS through Twilio's REST API. No-op unless TWILIO_* env vars are set. */
async function sendSms(phone, body) {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: authToken, TWILIO_FROM_NUMBER: from } = process.env;
  const to = toE164(phone);
  if (!sid || !authToken || !from || !to) return { success: false, error: 'SMS not configured' };
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body.slice(0, 320) }),
    });
    if (!response.ok) throw new Error(`Twilio responded ${response.status}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to send SMS:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Creates a notification in the database for a specific user, pushes it over
 * WebSockets, and — for important types — also sends an email (and SMS).
 *
 * @param {number} userId - The ID of the user receiving the notification.
 * @param {string} type - The type of notification (e.g., 'booking_approved', 'booking_request', 'message', 'payment_received', 'system_alert').
 * @param {string} title - The short title of the notification.
 * @param {string} message - The detailed message of the notification.
 * @param {string} link - The frontend URL path to redirect to when clicked (default '#').
 * @returns {Promise<Object>} The created notification object.
 */
async function createNotification(userId, type, title, message, link = '#') {
  try {
    const result = await query(
      `INSERT INTO notifications (user_id, type, title, message, link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, type, title, message, link]
    );
    emitToUser(userId, 'notification', result.rows[0]);

    if (EMAIL_TYPES.has(type) || SMS_TYPES.has(type)) {
      // Fire-and-forget: delivery problems must never block the main flow
      query('SELECT name, email, phone FROM users WHERE id = $1', [userId])
        .then(({ rows: [user] }) => {
          if (!user) return;
          if (EMAIL_TYPES.has(type)) sendNotificationEmail(user, title, message, link);
          if (SMS_TYPES.has(type)) sendSms(user.phone, `BoardingFinder: ${title} — ${message}`);
        })
        .catch((err) => console.error('❌ Failed to deliver notification:', err.message));
    }

    return result.rows[0];
  } catch (error) {
    console.error("❌ Failed to create notification:", error);
    // Don't throw the error, as we don't want notification failures to crash the main user flows (like booking)
    return null;
  }
}

module.exports = {
  createNotification,
  sendSms,
  toE164,
};
