const { query } = require("../db");

// A student may rate/review a room only after actually staying there:
// an approved booking for that listing whose stay has either finished,
// or began at least MIN_STAY_DAYS ago.
const MIN_STAY_DAYS = 3;

/**
 * @param {number|string} listingId
 * @param {{ id: number, role: string } | undefined} user
 * @returns {Promise<{ canReview: boolean, reason: string, code: string }>}
 *   code: 'ok' | 'login' | 'role' | 'no_booking' | 'too_early' | 'already_reviewed'
 */
async function getReviewEligibility(listingId, user) {
  if (!user) {
    return { canReview: false, code: "login", reason: "Log in as a student who has stayed here to write a review." };
  }
  if (user.role !== "student") {
    return { canReview: false, code: "role", reason: "Only students who have stayed here can write reviews." };
  }

  const existing = await query("SELECT 1 FROM reviews WHERE listing_id = $1 AND user_id = $2 LIMIT 1", [listingId, user.id]);
  if (existing.rows.length > 0) {
    return { canReview: false, code: "already_reviewed", reason: "You have already reviewed this property." };
  }

  // Approved (or completed) bookings for this room, with their stay dates
  const stays = await query(
    `SELECT move_in_date,
            (move_in_date + (duration_months || ' months')::interval)::date AS move_out_date,
            (CURRENT_DATE >= (move_in_date + (duration_months || ' months')::interval)::date) AS finished,
            (CURRENT_DATE - move_in_date) AS days_in
     FROM bookings
     WHERE listing_id = $1 AND seeker_id = $2 AND status IN ('approved', 'completed')
     ORDER BY move_in_date ASC`,
    [listingId, user.id]
  );

  if (stays.rows.length === 0) {
    return { canReview: false, code: "no_booking", reason: "Only guests with an approved booking for this room can review it." };
  }

  if (stays.rows.some((s) => s.finished || Number(s.days_in) >= MIN_STAY_DAYS)) {
    return { canReview: true, code: "ok", reason: "" };
  }

  // Booked, but hasn't stayed long enough yet: tell them when they can review
  const first = stays.rows[0];
  const opens = new Date(first.move_in_date);
  opens.setDate(opens.getDate() + MIN_STAY_DAYS);
  return {
    canReview: false,
    code: "too_early",
    reason: `You can review this room after you've stayed at least ${MIN_STAY_DAYS} days (from ${opens.toISOString().slice(0, 10)}).`,
  };
}

module.exports = { getReviewEligibility, MIN_STAY_DAYS };
