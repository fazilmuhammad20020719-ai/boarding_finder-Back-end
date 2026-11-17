// Payments recorded against approved bookings, approval instructions and the
// automatic rejection of bookings whose payment deadline passed unpaid.
const { query, pool } = require('../db');
const { createNotification } = require('./notificationUtils');
const { computePaymentTerms, approvalMessage, todayISO, moveInAmount, lkr, longDate } = require('./paymentRules');

const METHODS = { cash: 'Cash', bank_transfer: 'Bank transfer', other: 'Other' };

/**
 * Work out the payment terms for a booking being approved (call inside the
 * approval transaction). Returns the column values to store.
 */
async function termsForApproval(client, bookingId) {
  const { rows: [b] } = await client.query(
    `SELECT to_char(b.move_in_date, 'YYYY-MM-DD') AS arrival, l.price, l.security_deposit
     FROM bookings b JOIN listings l ON l.listing_id = b.listing_id WHERE b.booking_id = $1`,
    [bookingId]
  );
  if (!b) return null;
  const terms = computePaymentTerms(b.arrival, todayISO(), moveInAmount(b.price, b.security_deposit));
  return { ...terms, arrival: b.arrival };
}

/** In-app + email message to the student when their booking is approved. */
async function notifyApproval(booking) {
  const { rows: [b] } = await query(
    `SELECT b.seeker_id, to_char(b.move_in_date, 'YYYY-MM-DD') AS arrival, to_char(b.payment_deadline, 'YYYY-MM-DD') AS deadline,
            b.payment_plan, b.required_amount, b.booking_amount, l.title
     FROM bookings b JOIN listings l ON l.listing_id = b.listing_id WHERE b.booking_id = $1`,
    [booking.booking_id]
  );
  if (!b) return;
  const terms = { plan: b.payment_plan, deadline: b.deadline, required: Number(b.required_amount), total: Number(b.booking_amount) };
  // 'always': payment instructions are sent even if booking updates are switched off
  await createNotification(b.seeker_id, 'booking_approved', 'Booking approved – payment needed',
    approvalMessage(b.title, b.arrival, terms), '/my-bookings', 'always');
}

/** Recalculate the payment totals of a booking from its payment records. */
async function refreshTotals(client, bookingId) {
  const { rows: [t] } = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS paid, MAX(paid_on) AS last_paid
     FROM booking_payments WHERE booking_id = $1`,
    [bookingId]
  );
  const { rows: [b] } = await client.query(
    `UPDATE bookings
     SET paid_amount = NULLIF($1::numeric, 0),
         paid_at = $2,
         payment_status = CASE
           WHEN $1::numeric <= 0 THEN 'unpaid'
           WHEN $1::numeric >= COALESCE(booking_amount, 0) AND COALESCE(booking_amount, 0) > 0 THEN 'paid'
           ELSE 'partial' END,
         updated_at = NOW()
     WHERE booking_id = $3 RETURNING *`,
    [t.paid, t.last_paid, bookingId]
  );
  return b;
}

const isConfirmed = (b) => b.status === 'approved' && (
  b.payment_status === 'paid' || (b.required_amount != null && Number(b.paid_amount || 0) >= Number(b.required_amount))
);

/**
 * Record a payment (owner or admin). Rejects overpayment and bookings that
 * aren't approved. Returns { booking, payment, confirmedNow }.
 */
async function recordPayment(bookingId, user, { amount, paid_on, method, reference }) {
  const value = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(value) || value <= 0 || value > 10000000) throw Object.assign(new Error('Enter a valid amount.'), { status: 400 });
  const day = String(paid_on || todayISO()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) throw Object.assign(new Error('Enter a valid payment date.'), { status: 400 });
  if (day > todayISO()) throw Object.assign(new Error("The payment date can't be in the future."), { status: 400 });
  const how = METHODS[method] ? method : 'cash';
  const ref = reference ? String(reference).trim().slice(0, 100) : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock the booking so two recordings (or the deadline job) can't interleave
    const { rows: [b] } = await client.query(
      `SELECT b.*, l.title, l.price, l.security_deposit FROM bookings b
       JOIN listings l ON l.listing_id = b.listing_id WHERE b.booking_id = $1 FOR UPDATE OF b`,
      [bookingId]
    );
    if (!b) throw Object.assign(new Error('Booking not found'), { status: 404 });
    if (b.owner_id !== user.id && user.role !== 'admin') throw Object.assign(new Error('Only the owner of this boarding place can record payments.'), { status: 403 });
    if (b.status !== 'approved') throw Object.assign(new Error('Payments can only be recorded for an approved booking.'), { status: 400 });

    // Bookings approved before payment terms existed: total = move-in amount
    if (b.booking_amount == null) {
      await client.query('UPDATE bookings SET booking_amount = $1 WHERE booking_id = $2', [moveInAmount(b.price, b.security_deposit), bookingId]);
      b.booking_amount = moveInAmount(b.price, b.security_deposit);
    }
    const wasConfirmed = isConfirmed(b);
    const remaining = Number(b.booking_amount) - Number(b.paid_amount || 0);
    if (value > remaining + 0.001) {
      throw Object.assign(new Error(`That's more than the balance due (${lkr(Math.max(0, remaining))}).`), { status: 400 });
    }

    const { rows: [payment] } = await client.query(
      `INSERT INTO booking_payments (booking_id, amount, paid_on, method, reference, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [bookingId, value, day, how, ref, user.id]
    );
    const updated = await refreshTotals(client, bookingId);
    await client.query('UPDATE bookings SET payment_confirmed_by = $1 WHERE booking_id = $2', [user.id, bookingId]);
    await client.query('COMMIT');

    const confirmedNow = !wasConfirmed && isConfirmed(updated);
    const paid = Number(updated.paid_amount || 0);
    await createNotification(
      b.seeker_id, 'payment_receipt', confirmedNow ? 'Payment received – booking confirmed' : 'Payment received',
      `Payment of ${lkr(value)} (${METHODS[how]}) recorded on ${longDate(day)} for ${b.title}. ` +
      `Paid so far: ${lkr(paid)} of ${lkr(updated.booking_amount)}.` +
      (confirmedNow ? ' Your booking is now confirmed.' : ''),
      '/payment-history', 'always'
    );
    if (user.role === 'admin' && b.owner_id !== user.id) {
      await createNotification(b.owner_id, 'system_alert', 'Payment recorded by admin',
        `An admin recorded a payment of ${lkr(value)} for ${b.title}.`, '/manage-reservations');
    }
    return { booking: updated, payment, confirmedNow };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Remove a payment recorded by mistake (owner or admin). */
async function deletePayment(bookingId, paymentId, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [b] } = await client.query('SELECT * FROM bookings WHERE booking_id = $1 FOR UPDATE', [bookingId]);
    if (!b) throw Object.assign(new Error('Booking not found'), { status: 404 });
    if (b.owner_id !== user.id && user.role !== 'admin') throw Object.assign(new Error('Unauthorized'), { status: 403 });
    if (b.status !== 'approved') throw Object.assign(new Error('Payments of a closed booking can no longer be changed.'), { status: 400 });
    const del = await client.query('DELETE FROM booking_payments WHERE payment_id = $1 AND booking_id = $2 RETURNING *', [paymentId, bookingId]);
    if (!del.rows.length) throw Object.assign(new Error('Payment not found'), { status: 404 });
    const updated = await refreshTotals(client, bookingId);
    await client.query('COMMIT');
    return { booking: updated };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function listPayments(bookingId) {
  const { rows } = await query(
    `SELECT p.payment_id, p.amount, to_char(p.paid_on, 'YYYY-MM-DD') AS paid_on, p.method, p.reference, p.created_at,
            u.name AS recorded_by_name
     FROM booking_payments p LEFT JOIN users u ON u.id = p.recorded_by
     WHERE p.booking_id = $1 ORDER BY p.paid_on, p.payment_id`,
    [bookingId]
  );
  return rows;
}

/**
 * Reject approved bookings whose payment deadline has passed without the
 * required payment. One UPDATE decides and marks each booking, so a booking is
 * rejected (and its student notified) only once, even if the job overlaps.
 */
async function autoRejectOverdue() {
  const { rows } = await query(
    `UPDATE bookings b
     SET status = 'rejected', rejection_reason = 'payment_overdue', updated_at = NOW()
     FROM listings l
     WHERE l.listing_id = b.listing_id
       AND b.status = 'approved'
       AND b.payment_deadline IS NOT NULL
       AND b.payment_deadline < $1::date
       AND COALESCE(b.paid_amount, 0) < COALESCE(b.required_amount, 0)
     RETURNING b.booking_id, b.seeker_id, b.owner_id, l.title,
               to_char(b.payment_deadline, 'YYYY-MM-DD') AS deadline, b.required_amount`,
    [todayISO()]
  );
  for (const b of rows) {
    await createNotification(b.seeker_id, 'booking_rejected', 'Booking cancelled – payment not received',
      `Your booking for ${b.title} was cancelled because the required payment of ${lkr(b.required_amount)} ` +
      `was not received by ${longDate(b.deadline)}. The room has been released; you can book again if it is still available.`,
      '/my-bookings', 'always');
    await createNotification(b.owner_id, 'system_alert', 'Booking released – unpaid',
      `A booking for ${b.title} was cancelled automatically because the payment deadline (${longDate(b.deadline)}) passed. The bed is free again.`,
      '/manage-reservations', 'newBookings');
  }
  if (rows.length) console.log(`⏰ Auto-rejected ${rows.length} unpaid booking(s)`);
  return rows.length;
}

/** Check deadlines at startup and then every 30 minutes. */
function startPaymentDeadlineJob(intervalMs = 30 * 60 * 1000) {
  const run = () => autoRejectOverdue().catch((err) => console.error('❌ Payment deadline job failed:', err.message));
  run();
  return setInterval(run, intervalMs);
}

module.exports = {
  METHODS, termsForApproval, notifyApproval, recordPayment, deletePayment, listPayments,
  autoRejectOverdue, startPaymentDeadlineJob, isConfirmed,
};
