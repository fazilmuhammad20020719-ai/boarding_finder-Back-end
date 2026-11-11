const { query, pool } = require("../../db");
const { createNotification } = require("../../utils/notificationUtils");
const { lockAndCount } = require("../../utils/occupancy");

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
    // Status guard: don't approve if someone changed it meanwhile
    const upd = await client.query(
      "UPDATE bookings SET status = 'approved', updated_at = NOW() WHERE booking_id = $1 AND status = $2 RETURNING *",
      [bookingId, expectedStatus]
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
      `SELECT b.*, l.title, l.location, l.price, l.image_urls
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
      `SELECT b.*, l.title, u.name as seeker_name, u.email as seeker_email,
              lease.status as lease_status
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
        '/manage-reservations'
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

    await createNotification(
      seeker_id,
      status === 'approved' ? 'booking_approved' : status === 'rejected' ? 'booking_rejected' : 'system_alert',
      notificationTitle,
      notificationMsg,
      '/my-bookings'
    );

    if (roomNowFull) {
      await createNotification(
        owner_id,
        'system_alert',
        "Room fully booked",
        `${title} is now fully booked. New booking requests are paused until a bed frees up.`,
        '/manage-reservations'
      );
    }

    res.status(200).json({ message: "Booking updated", booking: updated.rows[0], room_full: roomNowFull });
  } catch (err) {
    console.error("Update booking status error:", err);
    res.status(500).json({ error: "Server error" });
  }
};


/**
 * Check if the current logged-in user already has a booking for a specific listing.
 * Returns { booking: null } if none found, or { booking: {...} } with status if found.
 */
const checkBookingForListing = async (req, res) => {
  try {
    const seeker_id = req.user.id;
    const { listingId } = req.params;

    const result = await query(
      `SELECT booking_id, status, move_in_date, duration_months, total_amount
       FROM bookings
       WHERE seeker_id = $1 AND listing_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [seeker_id, listingId]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({ booking: null });
    }

    res.status(200).json({ booking: result.rows[0] });
  } catch (err) {
    console.error("Check booking error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = { getMyBookings, getOwnerBookings, updateBookingStatus, checkBookingForListing, approveWithinCapacity };
