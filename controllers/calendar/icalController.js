const crypto = require("crypto");
const dns = require("dns").promises;
const net = require("net");
const { query } = require("../../db");
const { fullyBookedPeriods } = require("../../utils/occupancy");

const ICAL_REASON = "ical";

const ownsListing = async (listingId, user) => {
  const result = await query("SELECT owner_id, title, ical_token FROM listings WHERE listing_id = $1", [listingId]);
  const listing = result.rows[0];
  if (!listing) return { status: 404 };
  if (listing.owner_id !== user.id && user.role !== "admin") return { status: 403 };
  return { listing };
};

const toIcalDate = (date) => new Date(date).toISOString().slice(0, 10).replace(/-/g, "");

// ─────────────────────────────────────────────
// GET /api/calendar/:listingId/ical-link  (owner)
// Returns the secret export URL, creating its token on first use.
// ─────────────────────────────────────────────
const getIcalLink = async (req, res) => {
  try {
    const listingId = parseInt(req.params.listingId, 10);
    const { status, listing } = await ownsListing(listingId, req.user);
    if (status) return res.status(status).json({ error: status === 404 ? "Listing not found" : "Access denied" });

    let token = listing.ical_token;
    if (!token) {
      token = crypto.randomBytes(24).toString("hex");
      await query("UPDATE listings SET ical_token = $1 WHERE listing_id = $2", [token, listingId]);
    }

    const base = (process.env.API_PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    res.json({ url: `${base}/api/calendar/ical/${listingId}/${token}.ics` });
  } catch (err) {
    console.error("Error getting iCal link:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// ─────────────────────────────────────────────
// GET /api/calendar/ical/:listingId/:token.ics  (public, secret-token protected)
// Calendar apps (Google Calendar, Airbnb, Booking.com) fetch this without auth headers.
// ─────────────────────────────────────────────
const exportIcal = async (req, res) => {
  try {
    const listingId = parseInt(req.params.listingId, 10);
    const token = String(req.params.token || "");
    const result = await query("SELECT title, ical_token, capacity FROM listings WHERE listing_id = $1", [listingId]);
    const listing = result.rows[0];

    const valid = listing?.ical_token && token.length === listing.ical_token.length
      && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(listing.ical_token));
    if (!valid) return res.status(404).send("Not found");

    // Manual blocks (not ones imported from elsewhere — avoids sync loops)
    const manual = await query(
      `SELECT 'block-' || id AS uid, start_date, end_date FROM calendar_blocks
       WHERE listing_id = $1 AND reason <> $2`,
      [listingId, ICAL_REASON]
    );
    // Shared rooms are only unavailable while EVERY bed is taken by approved bookings
    const stays = await query(
      `SELECT to_char(move_in_date, 'YYYY-MM-DD') AS start,
              to_char((move_in_date + (duration_months || ' months')::interval)::date, 'YYYY-MM-DD') AS "end"
       FROM bookings WHERE listing_id = $1 AND status = 'approved'`,
      [listingId]
    );
    const full = fullyBookedPeriods(stays.rows, listing.capacity).map((p) => ({
      uid: `full-${p.start}`, start_date: p.start, end_date: p.end,
    }));
    const blocks = { rows: [...manual.rows, ...full] };

    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//BoardingFinder//Availability//EN",
      "CALSCALE:GREGORIAN",
      `X-WR-CALNAME:${listing.title.replace(/[\r\n,;]/g, " ")} (BoardingFinder)`,
    ];
    for (const b of blocks.rows) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${b.uid}-${listingId}@boardingfinder`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${toIcalDate(b.start_date)}`,
        // iCal all-day DTEND is exclusive
        `DTEND;VALUE=DATE:${toIcalDate(new Date(new Date(b.end_date).getTime() + 86400000))}`,
        "SUMMARY:Not available",
        "END:VEVENT"
      );
    }
    lines.push("END:VCALENDAR");

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.send(lines.join("\r\n"));
  } catch (err) {
    console.error("Error exporting iCal:", err);
    res.status(500).send("Server error");
  }
};

// Reject URLs that resolve to private/internal addresses (SSRF protection)
const isPublicAddress = (ip) => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return !(a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224);
  }
  const lower = ip.toLowerCase();
  return !(lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd")
    || lower.startsWith("fe80") || lower.startsWith("::ffff:"));
};

/** Parse VEVENT date ranges from an .ics body. Returns [{ start, end }] as YYYY-MM-DD (end inclusive). */
const parseIcalEvents = (text) => {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const events = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const start = block.match(/\nDTSTART[^:\n]*:(\d{8})/);
    const end = block.match(/\nDTEND[^:\n]*:(\d{8})/);
    if (!start) continue;
    const fmt = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    const startDate = fmt(start[1]);
    // DTEND is exclusive; convert to an inclusive end date
    const endDate = end
      ? new Date(new Date(fmt(end[1])).getTime() - 86400000).toISOString().slice(0, 10)
      : startDate;
    events.push({ start: startDate, end: endDate < startDate ? startDate : endDate });
  }
  return events;
};

// ─────────────────────────────────────────────
// POST /api/calendar/:listingId/ical-import  (owner)  { url }
// Replaces previously imported blocks with the events in the remote calendar.
// ─────────────────────────────────────────────
const importIcal = async (req, res) => {
  try {
    const listingId = parseInt(req.params.listingId, 10);
    const { status } = await ownsListing(listingId, req.user);
    if (status) return res.status(status).json({ error: status === 404 ? "Listing not found" : "Access denied" });

    let url;
    try {
      url = new URL(String(req.body.url || "").replace(/^webcal:/i, "https:"));
    } catch {
      return res.status(400).json({ error: "Please enter a valid iCal URL." });
    }
    if (url.protocol !== "https:") {
      return res.status(400).json({ error: "iCal URL must use https." });
    }
    const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => []);
    if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) {
      return res.status(400).json({ error: "That calendar address can't be reached." });
    }

    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      return res.status(400).json({ error: `Calendar server responded with ${response.status}.` });
    }
    const body = await response.text();
    if (body.length > 2 * 1024 * 1024 || !body.includes("BEGIN:VCALENDAR")) {
      return res.status(400).json({ error: "That link doesn't look like an iCal calendar." });
    }

    const today = new Date().toISOString().slice(0, 10);
    const events = parseIcalEvents(body).filter((e) => e.end >= today).slice(0, 500);

    await query("DELETE FROM calendar_blocks WHERE listing_id = $1 AND reason = $2", [listingId, ICAL_REASON]);
    for (const e of events) {
      await query(
        "INSERT INTO calendar_blocks (listing_id, start_date, end_date, reason) VALUES ($1, $2, $3, $4)",
        [listingId, e.start, e.end, ICAL_REASON]
      );
    }
    await query("UPDATE listings SET ical_import_url = $1, ical_synced_at = NOW() WHERE listing_id = $2", [url.toString(), listingId]);

    res.json({ message: `Imported ${events.length} blocked period(s).`, imported: events.length });
  } catch (err) {
    console.error("Error importing iCal:", err);
    res.status(500).json({ error: "Failed to import calendar" });
  }
};

module.exports = { getIcalLink, exportIcal, importIcal, parseIcalEvents, isPublicAddress };
