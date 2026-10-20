// ─────────────────────────────────────────────────────────────
//  PayHere (Sri Lanka) payment gateway helpers
//  Docs: https://support.payhere.lk/api-&-mobile-sdk/payhere-checkout
// ─────────────────────────────────────────────────────────────
const crypto = require("crypto");

const md5Upper = (value) => crypto.createHash("md5").update(value).digest("hex").toUpperCase();

const config = () => ({
  merchantId: process.env.PAYHERE_MERCHANT_ID,
  merchantSecret: process.env.PAYHERE_MERCHANT_SECRET,
  sandbox: process.env.PAYHERE_SANDBOX !== "false",
  currency: process.env.PAYHERE_CURRENCY || "LKR",
  // Public URL of this API (PayHere must be able to reach /api/payments/notify)
  apiPublicUrl: (process.env.API_PUBLIC_URL || "").replace(/\/$/, ""),
  frontendUrl: (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, ""),
});

const isConfigured = () => {
  const c = config();
  return Boolean(c.merchantId && c.merchantSecret && c.apiPublicUrl);
};

const formatAmount = (amount) => Number(amount).toFixed(2);

/**
 * Build the fields for a PayHere checkout form POST.
 * The browser submits these to `action` — the secret itself never leaves the server.
 */
const buildCheckout = ({ orderId, amount, items, customer }) => {
  const c = config();
  const amountStr = formatAmount(amount);
  const hash = md5Upper(c.merchantId + orderId + amountStr + c.currency + md5Upper(c.merchantSecret));
  const [firstName, ...rest] = (customer.name || "Customer").split(" ");

  return {
    action: c.sandbox ? "https://sandbox.payhere.lk/pay/checkout" : "https://www.payhere.lk/pay/checkout",
    fields: {
      merchant_id: c.merchantId,
      return_url: `${c.frontendUrl}/payment/success?order_id=${orderId}`,
      cancel_url: `${c.frontendUrl}/payment/cancel?order_id=${orderId}`,
      notify_url: `${c.apiPublicUrl}/api/payments/notify`,
      order_id: orderId,
      items,
      currency: c.currency,
      amount: amountStr,
      first_name: firstName,
      last_name: rest.join(" ") || "-",
      email: customer.email,
      phone: customer.phone || "0000000000",
      address: customer.address || "N/A",
      city: customer.city || "Colombo",
      country: "Sri Lanka",
      hash,
    },
  };
};

/**
 * Verify the md5sig PayHere sends to notify_url.
 * md5sig = UPPER(MD5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + UPPER(MD5(secret))))
 */
const verifyNotification = (body) => {
  const c = config();
  const { merchant_id, order_id, payhere_amount, payhere_currency, status_code, md5sig } = body;
  if (!merchant_id || !order_id || !md5sig || merchant_id !== c.merchantId) return false;
  const expected = md5Upper(
    merchant_id + order_id + payhere_amount + payhere_currency + status_code + md5Upper(c.merchantSecret)
  );
  const a = Buffer.from(expected);
  const b = Buffer.from(String(md5sig).toUpperCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// PayHere status_code → our order status
const STATUS_MAP = { "2": "success", "0": "pending", "-1": "canceled", "-2": "failed", "-3": "chargedback" };

// Listing promotion plans. Prices are set server-side so clients cannot tamper with them.
const PROMOTION_PLANS = {
  basic: { name: "Basic Boost", price: 2900, days: 3 },
  premium: { name: "Premium Placement", price: 5900, days: 7 },
  ultimate: { name: "Ultimate Spotlight", price: 11900, days: 14 },
};

module.exports = { isConfigured, buildCheckout, verifyNotification, formatAmount, STATUS_MAP, PROMOTION_PLANS, config };
