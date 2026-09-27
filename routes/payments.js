const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

// All payment routes require authentication
router.use(auth);

// Process a mock payment
router.post('/pay', async (req, res) => {
  try {
    const student_id = req.user.id;
    const { booking_id, amount, payment_type, method } = req.body;

    // Verify booking belongs to student and get owner_id
    const bookingRes = await query(
      "SELECT owner_id, status FROM bookings WHERE booking_id = $1 AND seeker_id = $2",
      [booking_id, student_id]
    );

    if (bookingRes.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found or unauthorized" });
    }

    const owner_id = bookingRes.rows[0].owner_id;
    
    // Generate mock transaction ID
    const transaction_id = `TXN-${Math.floor(1000000 + Math.random() * 9000000)}`;

    const result = await query(
      `INSERT INTO payments 
       (transaction_id, booking_id, student_id, owner_id, amount, payment_type, method, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [transaction_id, booking_id, student_id, owner_id, amount, payment_type, method || 'Card', 'Completed']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Payment error:", err);
    res.status(500).json({ error: "Failed to process payment" });
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
