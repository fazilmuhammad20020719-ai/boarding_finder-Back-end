const express = require("express");
const router = express.Router();
const { query } = require("../db");
const authMiddleware = require("../middleware/auth");

// POST /api/leases - Generate a new lease
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { booking_id, terms } = req.body;
    const owner_id = req.user.id;

    if (!booking_id) {
      return res.status(400).json({ error: "Booking ID is required" });
    }

    // Ensure the booking exists and belongs to this owner
    const bookingResult = await query(`
      SELECT b.*, l.price 
      FROM bookings b
      JOIN listings l ON b.listing_id = l.listing_id
      WHERE b.booking_id = $1 AND b.owner_id = $2
    `, [booking_id, owner_id]);

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found or you are not the owner" });
    }

    const booking = bookingResult.rows[0];

    // Calculate end date based on duration
    const startDate = new Date(booking.move_in_date);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + booking.duration_months);

    const defaultTerms = terms || `This Residential Lease Agreement is between the Landlord and Tenant. The lease term will begin on ${startDate.toLocaleDateString()} and will terminate on ${endDate.toLocaleDateString()}. Tenant agrees to pay Landlord rent in the amount of LKR ${booking.price} per month.`;

    // Create the lease
    const leaseResult = await query(`
      INSERT INTO leases (booking_id, owner_id, student_id, listing_id, rent_amount, start_date, end_date, terms, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
      RETURNING *
    `, [booking_id, owner_id, booking.seeker_id, booking.listing_id, booking.price, startDate, endDate, defaultTerms]);

    res.status(201).json({ message: "Lease generated successfully", lease: leaseResult.rows[0] });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: "A lease already exists for this booking" });
    }
    console.error("Error generating lease:", error);
    res.status(500).json({ error: "Failed to generate lease" });
  }
});

// GET /api/leases/booking/:bookingId - Fetch lease by booking ID
router.get("/booking/:bookingId", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.id;

    const result = await query(`
      SELECT l.*, o.name as owner_name, s.name as student_name, list.title as property_name, list.location as property_address
      FROM leases l
      JOIN users o ON l.owner_id = o.id
      JOIN users s ON l.student_id = s.id
      JOIN listings list ON l.listing_id = list.listing_id
      WHERE l.booking_id = $1 AND (l.owner_id = $2 OR l.student_id = $2)
    `, [bookingId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lease not found or access denied" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching lease:", error);
    res.status(500).json({ error: "Failed to fetch lease" });
  }
});

// PUT /api/leases/:id/sign - Sign a lease
router.put("/:id/sign", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { signature } = req.body;
    const student_id = req.user.id;

    if (!signature) {
      return res.status(400).json({ error: "Signature is required" });
    }

    // Verify it's the student signing
    const leaseCheck = await query("SELECT status FROM leases WHERE id = $1 AND student_id = $2", [id, student_id]);
    
    if (leaseCheck.rows.length === 0) {
      return res.status(404).json({ error: "Lease not found or you are not authorized to sign it" });
    }
    
    if (leaseCheck.rows[0].status === 'signed') {
      return res.status(400).json({ error: "Lease is already signed" });
    }

    const result = await query(`
      UPDATE leases 
      SET student_signature = $1, signed_at = NOW(), status = 'signed'
      WHERE id = $2 AND student_id = $3
      RETURNING *
    `, [signature, id, student_id]);

    res.json({ message: "Lease signed successfully", lease: result.rows[0] });
  } catch (error) {
    console.error("Error signing lease:", error);
    res.status(500).json({ error: "Failed to sign lease" });
  }
});

module.exports = router;
