const { query, pool } = require("../../db");
const { createNotification } = require("../../utils/notificationUtils");
const { lockAndCount } = require("../../utils/occupancy");
const bookingPayments = require("../../utils/bookingPayments");

/**
 * Approve a booking only if a bed is free and its dates avoid blocked periods.
 * Runs in one transaction with the room row locked, so concurrent approvals
 * for the last bed are serialised (the second one sees the room full).
 * @returns {Promise<{booking, full} | {error, code}>}
 */
async function approveWithinCapacity(listingId, bookingId, expectedStatus) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const room = await lockAndCount(client, listingId, bookingId);
    if (!room) { await client.query("ROLLBACK"); return { error: "Listing not found", code: "not_found" }; }
    if (room.available <= 0) {
      await client.query("ROLLBACK");
      return { error: `This room is fully booked (${room.occupied}/${room.capacity} beds taken).`, code: "fully_booked" };
    }
    const blocked = await client.query(
      `SELECT 1 FROM calendar_blocks c, bookings b
       WHERE b.booking_id = $1 AND c.listing_id = b.listing_id
         AND c.start_date < (b.move_in_date + (b.duration_months || ' months')::interval)
         AND c.end_date >= b.move_in_date
       LIMIT 1`,
      [bookingId]
    );
    if (blocked.rows.length > 0) {
      await client.query("ROLLBACK");
      return { error: "These dates overlap dates you have blocked on the calendar.", code: "blocked_dates" };
    }
    // Payment terms are fixed now: amount, minimum to pay and deadline
    const terms = await bookingPayments.termsForApproval(client, bookingId);
    // Status guard: don't approve if someone changed it meanwhile
    const upd = await client.query(
      `UPDATE bookings
       SET status = 'approved', updated_at = NOW(), approved_at = NOW(), rejection_reason = NULL,
           booking_amount = $3, required_amount = $4, payment_deadline = $5, payment_plan = $6
       WHERE booking_id = $1 AND status = $2 RETURNING *`,
      [bookingId, expectedStatus, terms.total, terms.required, terms.deadline, terms.plan]
    );
    if (upd.rows.length === 0) {
      await client.query("ROLLBACK");
      return { error: "This booking was changed by someone else. Please refresh.", code: "conflict" };
    }
    await client.query("COMMIT");
    return { booking: upd.rows[0], full: room.available - 1 <= 0 };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const getMyBookings = async (req, res) => {
  try {
    const seeker_id = req.user.id;

    const result = await query(
      `SELECT b.*, l.title, l.location, l.price, l.security_deposit, l.image_urls,
              to_char(b.move_in_date, 'YYYY-MM-DD') AS move_in_on,
              to_char(b.payment_deadline, 'YYYY-MM-DD') AS payment_deadline_on
       FROM bookings b
       JOIN listings l ON b.listing_id = l.listing_id
       WHERE b.seeker_id = $1
       ORDER BY b.created_at DESC`,
      [seeker_id]
    );

    res.status(200).json({ bookings: result.rows });
  } catch (err) {
    console.error("Get my bookings error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const getOwnerBookings = async (req, res) => {
  try {
    const owner_id = req.user.id;

    const result = await query(
      `SELECT b.*, l.title, l.price, l.security_deposit, u.name as seeker_name, u.email as seeker_email,
              lease.status as lease_status,
              -- dates as text so the browser shows them without time-zone shifts
              to_char(b.move_in_date, 'YYYY-MM-DD') AS move_in_on,
              to_char((b.move_in_date + (b.duration_months || ' months')::interval)::date, 'YYYY-MM-DD') AS move_out_on,
              to_char(b.arrived_at, 'YYYY-MM-DD') AS arrived_on,
              to_char(b.left_at, 'YYYY-MM-DD') AS left_on,
              to_char(b.payment_deadline, 'YYYY-MM-DD') AS payment_deadline_on
       FROM bookings b
       JOIN listings l ON b.listing_id = l.listing_id
       JOIN users u ON b.seeker_id = u.id
       LEFT JOIN leases lease ON b.booking_id = lease.booking_id
       WHERE b.owner_id = $1
       ORDER BY b.created_at DESC`,
      [owner_id]
    );

    res.status(200).json({ bookings: result.rows });
  } catch (err) {
    console.error("Get owner bookings error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const updateBookingStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const booking_id = req.params.id;
    const { status } = req.body;

    if (!['approved', 'rejected', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    // Verify ownership
    const bookingRes = await query(
"SELECT b.owner_id, b.seeker_id, b.status, b.listing_id, l.title FROM bookings b JOIN listings l ON b.listing_id = l.listing_id WHERE b.booking_id = $1",
      [booking_id]
    );
    if (bookingRes.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const current = bookingRes.rows[0].status;
    const isOwner = bookingRes.rows[0].owner_id === userId || req.user.role === 'admin';
    // Students may only cancel their own pending requests
    const isSeekerCancelling = bookingRes.rows[0].seeker_id === userId
      && status === 'cancelled'
      && current === 'pending';

    if (!isOwner && !isSeekerCancelling) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Allowed owner transitions: pending → approved/rejected/cancelled, approved → cancelled.
    // Cancelled and rejected bookings are final (the student books again instead).
    const OWNER_TRANSITIONS = { pending: ['approved', 'rejected', 'cancelled'], approved: ['cancelled'] };
    if (!isSeekerCancelling && !(OWNER_TRANSITIONS[current] || []).includes(status)) {
      return res.status(400).json({ error: `A ${current} booking cannot be changed to ${status}.` });
    }

    let updated;
    let roomNowFull = false;
    if (status === 'approved') {
      // Approving takes a bed. Lock the room so two approvals can't both take the last one.
      const result = await approveWithinCapacity(bookingRes.rows[0].listing_id, booking_id, current);
      if (result.error) return res.status(409).json({ error: result.error, code: result.code });
      updated = { rows: [result.booking] };
      roomNowFull = result.full;
    } else {
      updated = await query(
        "UPDATE bookings SET status = $1, updated_at = NOW() WHERE booking_id = $2 RETURNING *",
        [status, booking_id]
      );
    }

    const { seeker_id, owner_id, title } = bookingRes.rows[0];

    if (isSeekerCancelling) {
      await createNotification(
        owner_id,
        'system_alert',
        "Booking Request Cancelled",
        `A student cancelled their booking request for ${title}.`,
        '/manage-reservations',
        'newBookings'
      );
      return res.status(200).json({ message: "Booking cancelled", booking: updated.rows[0] });
    }

    // Trigger Notification for Student
    let notificationTitle = "Booking Updated";
    let notificationMsg = `Your booking for ${title} has been updated.`;
    
    if (status === 'approved') {
      notificationTitle = "Booking Approved!";
      notificationMsg = `Your booking request for ${title} has been approved.`;
    } else if (status === 'rejected') {
      notificationTitle = "Booking Rejected";
      notificationMsg = `Unfortunately, your booking request for ${title} was rejected.`;
    } else if (status === 'cancelled') {
      notificationTitle = "Booking Cancelled";
      notificationMsg = `Your booking for ${title} has been cancelled by the owner.`;
    }

    if (status === 'approved') {
      await bookingPayments.notifyApproval(updated.rows[0]);
    } else await createNotification(
      seeker_id,
      status === 'rejected' ? 'booking_rejected' : 'system_alert',
      notificationTitle,
      notificationMsg,
      '/my-bookings',
      'bookingUpdates'
    );

    if (roomNowFull) {
      await createNotification(
        owner_id,
        'system_alert',
        "Room fully booked",
        `${title} is now fully booked. New booking requests are paused until a bed frees up.`,
        '/manage-reservations',
        'newBookings'
      );
    }

    res.status(200).json({ message: "Booking updated", booking: updated.rows[0], room_full: roomNowFull });
  } catch (err) {
    console.error("Update booking status error:", err);
    res.status(500).json({ error: "Server error" });
  }
};


/**
 * Cash on Move-in: the owner (or an admin) confirms once that the move-in cash
 * was received, or undoes that confirmation. There is no online payment and no
 * monthly rent tracking — one confirmation per booking.
 * PUT /api/bookings/:id/payment  { paid: boolean, amount?: number }
 */
// Payments are recorded by the owner (or an admin): the student pays by bank
// transfer or cash before arrival. See utils/paymentRules.js for the deadlines.
const sendError = (res, err, label) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(label, err);
  return res.status(500).json({ error: "Server error" });
};

// GET /api/bookings/:id/payments — owner, admin or the booking's student
const getPayments = async (req, res) => {
  try {
    const { rows: [b] } = await query("SELECT owner_id, seeker_id FROM bookings WHERE booking_id = $1", [req.params.id]);
    if (!b) return res.status(404).json({ error: "Booking not found" });
    if (![b.owner_id, b.seeker_id].includes(req.user.id) && req.user.role !== 'admin') return res.status(403).json({ error: "Unauthorized" });
    res.json({ payments: await bookingPayments.listPayments(req.params.id) });
  } catch (err) { sendError(res, err, "Get payments error:"); }
};

// POST /api/bookings/:id/payments  { amount, paid_on, method: cash|bank_transfer|other, reference }
const addPayment = async (req, res) => {
  try {
    const result = await bookingPayments.recordPayment(Number(req.params.id), req.user, req.body || {});
    res.status(201).json({ message: result.confirmedNow ? "Payment recorded – booking confirmed" : "Payment recorded", ...result });
  } catch (err) { sendError(res, err, "Add payment error:"); }
};

// DELETE /api/bookings/:id/payments/:paymentId — undo a payment recorded by mistake
const removePayment = async (req, res) => {
  try {
    res.json(await bookingPayments.deletePayment(Number(req.params.id), Number(req.params.paymentId), req.user));
  } catch (err) { sendError(res, err, "Remove payment error:"); }
};

// PUT /api/bookings/:id/stay  { action: 'arrived' | 'left' | 'undo_arrived' | 'undo_left', date?: 'YYYY-MM-DD' }
// The owner (or an admin) records when the student actually moved in and out.
// Recording "left" ends the stay on that day, so the bed is free again.
const updateStay = async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const { action } = req.body;
    if (!Number.isInteger(bookingId)) return res.status(400).json({ error: "Invalid booking" });
    if (!['arrived', 'left', 'undo_arrived', 'undo_left'].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const { rows: [b] } = await query(
      `SELECT b.booking_id, b.owner_id, b.seeker_id, b.status, to_char(b.arrived_at, 'YYYY-MM-DD') AS arrived_at, to_char(b.left_at, 'YYYY-MM-DD') AS left_at,
              to_char(b.move_in_date, 'YYYY-MM-DD') AS move_in, l.title
       FROM bookings b JOIN listings l ON l.listing_id = b.listing_id WHERE b.booking_id = $1`,
      [bookingId]
    );
    if (!b) return res.status(404).json({ error: "Booking not found" });
    if (b.owner_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: "Unauthorized" });
    if (b.status !== 'approved') return res.status(400).json({ error: "Only approved bookings have a stay to record." });

    // Today in Sri Lanka; dates can't be in the future
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TIMEZONE || 'Asia/Colombo' }).format(new Date());
    const date = req.body.date ? String(req.body.date).slice(0, 10) : today;
    if ((action === 'arrived' || action === 'left') && (!/^d{4}-d{2}-d{2}$/.test(date) || Number.isNaN(Date.parse(date)))) {
      return res.status(400).json({ error: "Please give a valid date (YYYY-MM-DD)." });
    }
    if ((action === 'arrived' || action === 'left') && date > today) {
      return res.status(400).json({ error: "The date can't be in the future." });
    }

    let sql, params;
    if (action === 'arrived') {
      if (b.left_at && date > b.left_at) return res.status(400).json({ error: "Arrival can't be after the leave date." });
      sql = "UPDATE bookings SET arrived_at = $1, updated_at = NOW() WHERE booking_id = $2 RETURNING *";
      params = [date, bookingId];
    } else if (action === 'left') {
      if (!b.arrived_at) return res.status(400).json({ error: "Mark the student as arrived first." });
      if (date < b.arrived_at) return res.status(400).json({ error: "The leave date can't be before the arrival date." });
      sql = "UPDATE bookings SET left_at = $1, updated_at = NOW() WHERE booking_id = $2 RETURNING *";
      params = [date, bookingId];
    } else if (action === 'undo_arrived') {
      if (b.left_at) return res.status(400).json({ error: "Undo the leave date first." });
      sql = "UPDATE bookings SET arrived_at = NULL, updated_at = NOW() WHERE booking_id = $1 RETURNING *";
      params = [bookingId];
    } else {
      sql = "UPDATE bookings SET left_at = NULL, updated_at = NOW() WHERE booking_id = $1 RETURNING *";
      params = [bookingId];
    }
    const { rows: [updated] } = await query(sql, params);

    if (action === 'left') {
      await createNotification(
        b.seeker_id, 'system_alert', 'Stay ended',
        `Your owner recorded that you moved out of ${b.title} on ${date}. You can now leave a review.`,
        '/my-bookings', 'bookingUpdates'
      );
    }

    return res.status(200).json({ message: "Stay updated", booking: updated });
  } catch (err) {
    console.error("Update stay error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = { getMyBookings, getOwnerBookings, updateBookingStatus, getPayments, addPayment, removePayment, updateStay, checkBookingForListing, approveWithinCapacity };
