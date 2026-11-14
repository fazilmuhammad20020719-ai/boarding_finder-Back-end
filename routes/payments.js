// Payments are Cash on Move-in only. There is no online payment gateway and no
// monthly rent tracking: each approved booking has one move-in payment that the
// owner confirms when the cash is received (PUT /api/bookings/:id/payment).
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

router.use(auth);

// Columns shared by the student and owner views. move_in_amount is what the
// student is expected to bring: the first month's rent plus the deposit.
const PAYMENT_COLUMNS = `
  b.booking_id, b.status, b.move_in_date, b.duration_months, b.total_amount,
  b.payment_status, b.paid_amount, b.paid_at,
  l.listing_id, l.title AS property_name, l.location,
  l.price AS monthly_rent, COALESCE(l.security_deposit, l.price, 0) AS security_deposit,
  (COALESCE(l.price, 0) + COALESCE(l.security_deposit, l.price, 0)) AS move_in_amount,
  'Cash on Move-in' AS method`;

// GET /api/payments/history — the student's move-in payments (approved bookings)
router.get('/history', async (req, res) => {
  try {
    const result = await query(
      `SELECT ${PAYMENT_COLUMNS}, o.name AS owner_name
       FROM bookings b
       JOIN listings l ON b.listing_id = l.listing_id
       JOIN users o ON b.owner_id = o.id
       WHERE b.seeker_id = $1 AND b.status = 'approved'
       ORDER BY b.move_in_date DESC`,
      [req.user.id]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Get payment history error:", err);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// GET /api/payments/ledger — the owner's move-in payments (approved bookings)
router.get('/ledger', async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: "Unauthorized" });
    }
    const result = await query(
      `SELECT ${PAYMENT_COLUMNS}, u.name AS student_name, u.phone AS student_phone
       FROM bookings b
       JOIN listings l ON b.listing_id = l.listing_id
       JOIN users u ON b.seeker_id = u.id
       WHERE b.owner_id = $1 AND b.status = 'approved'
       ORDER BY (b.payment_status = 'paid'), b.move_in_date`,
      [req.user.id]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Get ledger error:", err);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

module.exports = router;
