// Payment terms for an approved booking (no online gateway: the student pays
// the owner by bank transfer or cash, and the owner records it).
//
// Booking amount = the move-in amount: first month's rent + security deposit.
//
//   Arrival within 3 days   → FULL booking amount by the day AFTER arrival
//   Arrival in 4–5 days     → at least 20% advance by the day AFTER arrival
//   Arrival more than 5 days → at least 20% advance within 5 days of approval
// (Short-notice students arrive first and get one extra day to pay.)
//
// The deadline day is inclusive: a booking is only rejected once that whole
// day has passed without a qualifying payment.

const ADVANCE_RATE = 0.2;
const FULL_PAYMENT_WITHIN_DAYS = 3;
const ADVANCE_WINDOW_DAYS = 5;

const TZ = () => process.env.APP_TIMEZONE || 'Asia/Colombo';

/** Today's date (YYYY-MM-DD) in the app's time zone. */
const todayISO = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ() }).format(now);

/** Add days to a YYYY-MM-DD date. */
const addDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Whole days from a to b (YYYY-MM-DD). */
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** First month's rent + security deposit (deposit defaults to one month's rent, as elsewhere). */
const moveInAmount = (price, securityDeposit) =>
  Number(price || 0) + Number(securityDeposit ?? price ?? 0);

const roundUp = (n) => Math.ceil(n); // whole rupees, never below the 20% minimum

/**
 * @param {string} arrivalISO   move-in date YYYY-MM-DD
 * @param {string} approvalISO  approval date YYYY-MM-DD
 * @param {number} bookingAmount move-in amount
 * @returns {{ plan: 'full'|'advance', deadline: string, required: number, total: number, daysUntilArrival: number }}
 */
function computePaymentTerms(arrivalISO, approvalISO, bookingAmount) {
  const total = Math.max(0, Number(bookingAmount) || 0);
  const daysUntilArrival = daysBetween(approvalISO, arrivalISO);
  // Short notice: one day after arrival (never before the approval day itself)
  const afterArrival = addDays(arrivalISO, 1) > approvalISO ? addDays(arrivalISO, 1) : approvalISO;

  if (daysUntilArrival <= FULL_PAYMENT_WITHIN_DAYS) {
    return { plan: 'full', deadline: afterArrival, required: total, total, daysUntilArrival };
  }
  const advance = Math.min(total, roundUp(total * ADVANCE_RATE));
  if (daysUntilArrival <= ADVANCE_WINDOW_DAYS) {
    return { plan: 'advance', deadline: afterArrival, required: advance, total, daysUntilArrival };
  }
  // Within 5 days of approval (arrival is 6+ days away, so this is before arrival)
  return { plan: 'advance', deadline: addDays(approvalISO, ADVANCE_WINDOW_DAYS), required: advance, total, daysUntilArrival };
}

const lkr = (n) => `LKR ${Number(n || 0).toLocaleString('en-US')}`;
const longDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The approval message (in-app and email) with payment instructions. */
function approvalMessage(title, arrivalISO, terms) {
  const how = 'Pay the owner by bank transfer or in cash; the owner records your payment in BoardingFinder.';
  if (terms.plan === 'full') {
    return `Your booking for ${title} has been approved. Please complete the payment by the day after your arrival date to secure your booking. ` +
      `Arrival date: ${longDate(arrivalISO)}. Amount due: ${lkr(terms.total)} (first month's rent + deposit), ` +
      `to be paid by ${longDate(terms.deadline)}. ${how} If it isn't received by then, the booking will be cancelled automatically.`;
  }
  return `Your booking for ${title} has been approved. Booking date (arrival): ${longDate(arrivalISO)}. ` +
    `To secure your booking, pay at least ${lkr(terms.required)} (20% advance) of the ${lkr(terms.total)} booking amount ` +
    `(first month's rent + deposit) by ${longDate(terms.deadline)}. You may pay the full amount instead. ` +
    `The advance payment is required to secure the booking. ${how} ` +
    `If no qualifying payment is received by then, the booking will be cancelled automatically.`;
}

module.exports = {
  ADVANCE_RATE, todayISO, addDays, daysBetween, moveInAmount, computePaymentTerms, approvalMessage, lkr, longDate,
};
