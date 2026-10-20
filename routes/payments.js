const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const auth = require('../middleware/auth');
const { query } = require('../db');
const { createNotification } = require('../utils/notificationUtils');
const {
  isConfigured, buildCheckout, verifyNotification, formatAmount,
  STATUS_MAP, PROMOTION_PLANS, config,
} = require('../utils/payhere');

const newOrderId = (prefix) => `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

const ensureConfigured = (res) => {
  if (!isConfigured()) {
    res.status(503).json({ error: "Online payments are not configured yet. Please contact support." });
    return false;
  }
  return true;
};

// ─────────────────────────────────────────────
// POST /api/payments/notify  (PayHere server-to-server callback)
// Public: authenticated by the md5sig signature, not by JWT/CSRF.
// ─────────────────────────────────────────────
router.post('/notify', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    if (!isConfigured() || !verifyNotification(req.body)) {
      console.warn("Rejected PayHere notification with invalid signature for order", req.body?.order_id);
      return res.status(400).send("Invalid signature");
    }

    const { order_id, payhere_amount, payhere_currency, status_code, payment_id, method } = req.body;
    const status = STATUS_MAP[String(status_code)] || 'failed';

    const orderRes = await query("SELECT * FROM payment_orders WHERE order_id = $1", [order_id]);
    const order = orderRes.rows[0];
    if (!order) return res.status(404).send("Unknown order");

    // Amount/currency must match what we asked for
    if (formatAmount(order.amount) !== formatAmount(payhere_amount) || order.currency !== payhere_currency) {
      console.warn("PayHere amount mismatch for order", order_id);
      return res.status(400).send("Amount mismatch");
    }

    // Idempotent: only act on the first transition to success
    const updated = await query(
      `UPDATE payment_orders
       SET status = $1, payhere_payment_id = $2, method = $3, updated_at = NOW()
       WHERE order_id = $4 AND status <> 'success'
       RETURNING *`,
      [status, payment_id || null, method || null, order_id]
    );

    if (status === 'success' && updated.rows.length > 0) {
      if (order.purpose === 'booking') {
        const booking = await query(
          `SELECT b.owner_id, l.title FROM bookings b JOIN listings l ON b.listing_id = l.listing_id WHERE b.booking_id = $1`,
          [order.booking_id]
        );
        await query(
          `INSERT INTO payments (transaction_id, booking_id, student_id, owner_id, amount, payment_type, method, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'Completed')
           ON CONFLICT (transaction_id) DO NOTHING`,
          [order_id, order.booking_id, order.user_id, booking.rows[0]?.owner_id, order.amount, order.payment_type, method || 'PayHere']
        );
        if (booking.rows[0]) {
          await createNotification(
            order.user_id, 'payment_receipt', "Payment Confirmed",
            `Your payment of ${order.currency} ${formatAmount(order.amount)} (${order.payment_type}) for ${booking.rows[0].title} was successful. Ref: ${order_id}`,
            '/payment-history'
          );
          await createNotification(
            booking.rows[0].owner_id, 'payment_received', "Payment Received",
            `A payment of ${order.currency} ${formatAmount(order.amount)} was received for ${booking.rows[0].title}.`,
            '/earnings'
          );
        }
      } else if (order.purpose === 'promotion') {
        const plan = PROMOTION_PLANS[order.plan_id];
        // Extend an existing active promotion rather than overlapping it
        await query(
          `INSERT INTO promoted_listings (listing_id, owner_id, plan_id, order_id, starts_at, ends_at)
           VALUES ($1, $2, $3, $4,
             GREATEST(NOW(), COALESCE((SELECT MAX(ends_at) FROM promoted_listings WHERE listing_id = $1), NOW())),
             GREATEST(NOW(), COALESCE((SELECT MAX(ends_at) FROM promoted_listings WHERE listing_id = $1), NOW())) + ($5 || ' days')::interval)`,
          [order.listing_id, order.user_id, order.plan_id, order_id, String(plan.days)]
        );
      }
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("PayHere notify error:", err);
    return res.status(500).send("Error");
  }
});

// All other payment routes require authentication
router.use(auth);

// GET /api/payments/config — is online payment available?
router.get('/config', (req, res) => {
  res.json({ enabled: isConfigured(), currency: config().currency });
});

// GET /api/payments/promotion-plans
router.get('/promotion-plans', (req, res) => {
  res.json({
    currency: config().currency,
    plans: Object.entries(PROMOTION_PLANS).map(([id, p]) => ({ id, ...p })),
  });
});

const getCustomer = async (userId) => {
  const result = await query("SELECT name, email, phone FROM users WHERE id = $1", [userId]);
  return result.rows[0];
};

// POST /api/payments/checkout/booking — start a rent / deposit payment
router.post('/checkout/booking', async (req, res) => {
  try {
    if (!ensureConfigured(res)) return;
    const student_id = req.user.id;
    const { booking_id, amount, payment_type } = req.body;
    const value = Number(amount);

    const ALLOWED_TYPES = ['First Month Rent', 'Monthly Rent', 'Security Deposit', 'Utility Bill'];
    if (!ALLOWED_TYPES.includes(payment_type)) {
      return res.status(400).json({ error: "Invalid payment type" });
    }
    if (!Number.isFinite(value) || value <= 0 || value > 10000000) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const bookingRes = await query(
      `SELECT b.status, l.title FROM bookings b JOIN listings l ON b.listing_id = l.listing_id
       WHERE b.booking_id = $1 AND b.seeker_id = $2`,
      [booking_id, student_id]
    );
    if (bookingRes.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found or unauthorized" });
    }
    if (!['approved', 'completed'].includes(bookingRes.rows[0].status)) {
      return res.status(400).json({ error: "Payments can only be made for approved bookings" });
    }

    const orderId = newOrderId('BKG');
    const currency = config().currency;
    await query(
      `INSERT INTO payment_orders (order_id, purpose, user_id, booking_id, amount, currency, payment_type)
       VALUES ($1, 'booking', $2, $3, $4, $5, $6)`,
      [orderId, student_id, booking_id, value, currency, payment_type]
    );

    const customer = await getCustomer(student_id);
    res.status(201).json(buildCheckout({
      orderId,
      amount: value,
      items: `${payment_type} - ${bookingRes.rows[0].title}`.slice(0, 100),
      customer,
    }));
  } catch (err) {
    console.error("Booking checkout error:", err);
    res.status(500).json({ error: "Failed to start payment" });
  }
});

// POST /api/payments/checkout/promotion — owner pays to boost a listing
router.post('/checkout/promotion', async (req, res) => {
  try {
    if (!ensureConfigured(res)) return;
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: "Only owners can promote listings" });
    }
    const { listing_id, plan_id } = req.body;
    const plan = PROMOTION_PLANS[plan_id];
    if (!plan) return res.status(400).json({ error: "Invalid promotion plan" });

    const listingRes = await query(
      "SELECT title FROM listings WHERE listing_id = $1 AND owner_id = $2",
      [listing_id, req.user.id]
    );
    if (listingRes.rows.length === 0) {
      return res.status(404).json({ error: "Listing not found" });
    }

    const orderId = newOrderId('PRM');
    const currency = config().currency;
    await query(
      `INSERT INTO payment_orders (order_id, purpose, user_id, listing_id, plan_id, amount, currency, payment_type)
       VALUES ($1, 'promotion', $2, $3, $4, $5, $6, 'Listing Promotion')`,
      [orderId, req.user.id, listing_id, plan_id, plan.price, currency]
    );

    const customer = await getCustomer(req.user.id);
    res.status(201).json(buildCheckout({
      orderId,
      amount: plan.price,
      items: `${plan.name} - ${listingRes.rows[0].title}`.slice(0, 100),
      customer,
    }));
  } catch (err) {
    console.error("Promotion checkout error:", err);
    res.status(500).json({ error: "Failed to start payment" });
  }
});

// GET /api/payments/orders/:orderId — status for the return/cancel pages
router.get('/orders/:orderId', async (req, res) => {
  try {
    const result = await query(
      `SELECT o.order_id, o.purpose, o.amount, o.currency, o.status, o.payment_type, o.plan_id, o.created_at,
              COALESCE(lb.title, lp.title) AS property_name
       FROM payment_orders o
       LEFT JOIN bookings b ON o.booking_id = b.booking_id
       LEFT JOIN listings lb ON b.listing_id = lb.listing_id
       LEFT JOIN listings lp ON o.listing_id = lp.listing_id
       WHERE o.order_id = $1 AND o.user_id = $2`,
      [req.params.orderId, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Order not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get order error:", err);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// GET /api/payments/promotions — owner's promotions
router.get('/promotions', async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, l.title FROM promoted_listings p JOIN listings l ON p.listing_id = l.listing_id
       WHERE p.owner_id = $1 ORDER BY p.ends_at DESC`,
      [req.user.id]
    );
    res.json({ promotions: result.rows });
  } catch (err) {
    console.error("Get promotions error:", err);
    res.status(500).json({ error: "Failed to fetch promotions" });
  }
});

// Get payment history for student
router.get('/history', async (req, res) => {
  try {
    const student_id = req.user.id;
    
    const result = await query(
      `SELECT p.*, l.title as property_name
       FROM payments p
       JOIN bookings b ON p.booking_id = b.booking_id
       JOIN listings l ON b.listing_id = l.listing_id
       WHERE p.student_id = $1
       ORDER BY p.created_at DESC`,
      [student_id]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Get payment history error:", err);
    res.status(500).json({ error: "Failed to fetch payment history" });
  }
});

// Get ledger/earnings for owner
router.get('/ledger', async (req, res) => {
  try {
    const owner_id = req.user.id;
    
    if (req.user.role !== 'owner' && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const result = await query(
      `SELECT p.*, l.title as property_name, u.name as student_name
       FROM payments p
       JOIN bookings b ON p.booking_id = b.booking_id
       JOIN listings l ON b.listing_id = l.listing_id
       JOIN users u ON p.student_id = u.id
       WHERE p.owner_id = $1
       ORDER BY p.created_at DESC`,
      [owner_id]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Get ledger error:", err);
    res.status(500).json({ error: "Failed to fetch ledger" });
  }
});

module.exports = router;
