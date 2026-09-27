const express = require('express');
const router = express.Router();
const { query } = require('../db');
const auth = require('../middleware/auth');
const { createNotification } = require('../utils/notificationUtils');

// 1. Submit a New Maintenance Request (Student)
router.post('/', auth, async (req, res) => {
  try {
    const student_id = req.user.id;
    const { booking_id, title, category, urgency, description } = req.body;

    if (!booking_id || !title || !description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify the booking belongs to the student and get owner_id + listing_id
    const bookingQuery = await query(
      `SELECT owner_id, listing_id FROM bookings WHERE booking_id = $1 AND seeker_id = $2`,
      [booking_id, student_id]
    );

    if (bookingQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Valid booking not found for this user' });
    }

    const { owner_id, listing_id } = bookingQuery.rows[0];

    // Generate a unique ticket ID (e.g., TKT-123456)
    const ticket_id = 'TKT-' + Math.floor(100000 + Math.random() * 900000);

    const result = await query(
      `INSERT INTO maintenance_requests 
       (ticket_id, booking_id, student_id, owner_id, listing_id, title, category, urgency, description) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [ticket_id, booking_id, student_id, owner_id, listing_id, title, category, urgency, description]
    );

    // Notify Owner
    await createNotification(
      owner_id,
      'system_alert',
      'New Maintenance Request',
      `A new maintenance request (${ticket_id}) was submitted for ${title}.`,
      '/owner-dashboard' // Or maintenance tab logic
    );

    res.status(201).json({ message: 'Maintenance request submitted', ticket: result.rows[0] });
  } catch (err) {
    console.error('Error submitting maintenance request:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Get Student's Maintenance Requests
router.get('/student', auth, async (req, res) => {
  try {
    const student_id = req.user.id;
    const result = await query(
      `SELECT m.*, l.title as property_name 
       FROM maintenance_requests m
       JOIN listings l ON m.listing_id = l.listing_id
       WHERE m.student_id = $1 
       ORDER BY m.created_at DESC`,
      [student_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching student maintenance requests:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Get Owner's Maintenance Requests
router.get('/owner', auth, async (req, res) => {
  try {
    const owner_id = req.user.id;
    const result = await query(
      `SELECT m.*, l.title as property_name, u.name as student_name 
       FROM maintenance_requests m
       JOIN listings l ON m.listing_id = l.listing_id
       JOIN users u ON m.student_id = u.id
       WHERE m.owner_id = $1 
       ORDER BY m.created_at DESC`,
      [owner_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching owner maintenance requests:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Update Maintenance Request Status (Owner)
router.put('/:id/status', auth, async (req, res) => {
  try {
    const owner_id = req.user.id;
    const ticket_id = req.params.id; // This is the UUID `id`, not the display `ticket_id`
    const { status } = req.body;

    if (!['Pending', 'In Progress', 'Resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await query(
      `UPDATE maintenance_requests 
       SET status = $1, updated_at = NOW() 
       WHERE id = $2 AND owner_id = $3 
       RETURNING *`,
      [status, ticket_id, owner_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found or unauthorized' });
    }

    // Notify Student
    const updatedTicket = result.rows[0];
    await createNotification(
      updatedTicket.student_id,
      'system_alert',
      'Maintenance Update',
      `Your maintenance request (${updatedTicket.ticket_id}) is now: ${status}.`,
      '/maintenance-portal'
    );

    res.json({ message: 'Status updated', ticket: updatedTicket });
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
