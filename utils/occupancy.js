// Room availability, calculated live from bookings (never a stored counter,
// so it can't drift). A bed is "occupied" by an APPROVED booking whose stay
// hasn't ended yet — current residents and confirmed future move-ins.
// Confirmation = owner approval (Cash on Move-in; no online payment step).

/** SQL condition: booking row `b` currently holds a bed. */
const HOLDS_BED = `b.status = 'approved'
  AND (b.move_in_date + (b.duration_months || ' months')::interval) > CURRENT_DATE`;

/**
 * LATERAL join adding `occupied_count` for listing alias `l`.
 * Use:  FROM listings l LEFT JOIN LATERAL (${OCCUPANCY_LATERAL}) occ ON TRUE
 */
const OCCUPANCY_LATERAL = `
  SELECT COUNT(*)::int AS occupied_count
  FROM bookings b
  WHERE b.listing_id = l.listing_id AND ${HOLDS_BED}`;

/** Add capacity / occupancy / availability fields to a listing row. */
function withAvailability(row) {
  const capacity = Math.max(1, Number(row.capacity) || 1);
  const occupied = Math.max(0, Number(row.occupied_count) || 0);
  return {
    ...row,
    capacity,
    occupied_count: occupied,
    spaces_available: Math.max(0, capacity - occupied),
    is_fully_booked: occupied >= capacity,
  };
}

/**
 * Lock a listing row for the rest of the transaction and return its capacity
 * and how many beds are taken (optionally ignoring one booking). Locking makes
 * two simultaneous approvals/requests for the last bed queue up instead of
 * both succeeding.
 * @param {import('pg').PoolClient} client  must be inside BEGIN … COMMIT
 */
async function lockAndCount(client, listingId, excludeBookingId = null) {
  const lst = await client.query("SELECT capacity FROM listings WHERE listing_id = $1 FOR UPDATE", [listingId]);
  if (lst.rows.length === 0) return null;
  const occ = await client.query(
    `SELECT COUNT(*)::int AS n FROM bookings b
     WHERE b.listing_id = $1 AND ${HOLDS_BED} AND ($2::int IS NULL OR b.booking_id <> $2::int)`,
    [listingId, excludeBookingId]
  );
  const capacity = Math.max(1, Number(lst.rows[0].capacity) || 1);
  return { capacity, occupied: occ.rows[0].n, available: Math.max(0, capacity - occ.rows[0].n) };
}

/**
 * Date ranges when a room is completely full, for calendar exports.
 * @param {{start: string, end: string}[]} stays  YYYY-MM-DD, end EXCLUSIVE (move-out day)
 * @param {number} capacity
 * @returns {{start: string, end: string}[]}  end INCLUSIVE (last full day)
 */
function fullyBookedPeriods(stays, capacity) {
  const cap = Math.max(1, Number(capacity) || 1);
  const delta = new Map(); // date -> change in occupants
  for (const s of stays) {
    if (!(s.start < s.end)) continue;
    delta.set(s.start, (delta.get(s.start) || 0) + 1);
    delta.set(s.end, (delta.get(s.end) || 0) - 1);
  }
  const days = [...delta.keys()].sort();
  const periods = [];
  let count = 0;
  let fullSince = null;
  for (const day of days) {
    count += delta.get(day);
    if (count >= cap && fullSince === null) fullSince = day;
    if (count < cap && fullSince !== null) {
      const last = new Date(`${day}T00:00:00Z`);
      last.setUTCDate(last.getUTCDate() - 1);
      periods.push({ start: fullSince, end: last.toISOString().slice(0, 10) });
      fullSince = null;
    }
  }
  return periods;
}

module.exports = { HOLDS_BED, OCCUPANCY_LATERAL, withAvailability, lockAndCount, fullyBookedPeriods };
