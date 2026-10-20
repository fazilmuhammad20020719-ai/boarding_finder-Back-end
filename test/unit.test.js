// Unit tests — no database or network required.  Run: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.PAYHERE_MERCHANT_ID = "1211149";
process.env.PAYHERE_MERCHANT_SECRET = "test_secret";
process.env.API_PUBLIC_URL = "https://api.example.com";
process.env.FRONTEND_URL = "https://app.example.com";

// db.js connects on import; unit tests never touch the database, so stub it out.
require.cache[require.resolve("../db")] = {
  id: "db-stub", filename: require.resolve("../db"), loaded: true,
  exports: { query: async () => { throw new Error("DB not available in unit tests"); }, pool: {} },
};

const payhere = require("../utils/payhere");
const { parseIcalEvents, isPublicAddress } = require("../controllers/calendar/icalController");
const { validateTourUrl, validateCoordinates, validatePassword } = require("../utils/validators");
const { parsePagination, paginated, escapeLike } = require("../utils/pagination");
const { detectFileType, DOCUMENT_MIMES, IMAGE_MIMES } = require("../utils/fileSignature");
const { hashToken } = require("../utils/tokens");

const md5 = (s) => crypto.createHash("md5").update(s).digest("hex").toUpperCase();

test("PayHere checkout hash follows the documented formula", () => {
  const { action, fields } = payhere.buildCheckout({
    orderId: "BKG-1", amount: 1500, items: "Rent", customer: { name: "Jane Doe", email: "j@example.com" },
  });
  assert.equal(action, "https://sandbox.payhere.lk/pay/checkout");
  assert.equal(fields.amount, "1500.00");
  assert.equal(fields.hash, md5("1211149" + "BKG-1" + "1500.00" + "LKR" + md5("test_secret")));
  assert.equal(fields.notify_url, "https://api.example.com/api/payments/notify");
  assert.ok(!JSON.stringify(fields).includes("test_secret"), "secret must never be sent to the browser");
});

test("PayHere notification signature is verified", () => {
  const body = { merchant_id: "1211149", order_id: "BKG-1", payhere_amount: "1500.00", payhere_currency: "LKR", status_code: "2" };
  const sig = md5(body.merchant_id + body.order_id + body.payhere_amount + body.payhere_currency + body.status_code + md5("test_secret"));
  assert.equal(payhere.verifyNotification({ ...body, md5sig: sig }), true);
  assert.equal(payhere.verifyNotification({ ...body, md5sig: sig.toLowerCase() }), true);
  assert.equal(payhere.verifyNotification({ ...body, payhere_amount: "1.00", md5sig: sig }), false);
  assert.equal(payhere.verifyNotification({ ...body, merchant_id: "999", md5sig: sig }), false);
  assert.equal(payhere.verifyNotification({ ...body }), false);
});

test("iCal parser handles all-day and timed events with exclusive DTEND", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20270105", "DTEND;VALUE=DATE:20270110", "END:VEVENT",
    "BEGIN:VEVENT", "DTSTART:20270201T120000Z", "DTEND:20270203T100000Z", "END:VEVENT",
    "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20270301", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  assert.deepEqual(parseIcalEvents(ics), [
    { start: "2027-01-05", end: "2027-01-09" },
    { start: "2027-02-01", end: "2027-02-02" },
    { start: "2027-03-01", end: "2027-03-01" },
  ]);
});

test("SSRF guard rejects private and loopback addresses", () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.3.4", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  assert.equal(isPublicAddress("93.184.216.34"), true);
  assert.equal(isPublicAddress("2606:2800:220:1:248:1893:25c8:1946"), true);
});

test("validators: tour URLs, coordinates, passwords", () => {
  assert.equal(validateTourUrl("https://www.youtube.com/watch?v=abc").valid, true);
  assert.equal(validateTourUrl("").valid, true);
  assert.equal(validateTourUrl("http://www.youtube.com/watch?v=abc").valid, false);
  assert.equal(validateTourUrl("https://evil.example.com/tour").valid, false);
  assert.equal(validateTourUrl("javascript:alert(1)").valid, false);
  assert.equal(validateCoordinates(6.9, 79.8).valid, true);
  assert.equal(validateCoordinates(91, 0).valid, false);
  assert.equal(validateCoordinates(0, -181).valid, false);
  assert.equal(validatePassword("weak").valid, false);
  assert.equal(validatePassword("Str0ng!Passw0rd").valid, true);
});

test("pagination is bounded and LIKE wildcards are escaped", () => {
  assert.deepEqual(parsePagination({ query: {} }), { limit: 100, offset: 0 });
  assert.deepEqual(parsePagination({ query: { limit: "99999", offset: "-5" } }), { limit: 200, offset: 0 });
  assert.deepEqual(parsePagination({ query: { limit: "abc" } }, { defaultLimit: 10 }), { limit: 10, offset: 0 });
  const body = paginated("items", [{ id: 1, total_count: "3" }, { id: 2, total_count: "3" }], { limit: 2, offset: 0 });
  assert.deepEqual(body, { items: [{ id: 1 }, { id: 2 }], pagination: { total: 3, limit: 2, offset: 0, hasMore: true } });
  assert.equal(escapeLike("50%_off\\"), "50\\%\\_off\\\\");
});

test("upload magic-byte detection rejects disguised files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bf-sig-"));
  const write = (name, bytes) => { const p = path.join(dir, name); fs.writeFileSync(p, bytes); return p; };
  const png = write("a.jpg", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]));
  const php = write("b.jpg", Buffer.from("<?php system($_GET['c']); ?>"));
  const pdf = write("c.png", Buffer.from("%PDF-1.7 ...."));
  const svg = write("d.png", Buffer.from("<svg onload=alert(1)>"));
  assert.deepEqual(detectFileType(png, IMAGE_MIMES), { mime: "image/png", ext: ".png" });
  assert.equal(detectFileType(php, DOCUMENT_MIMES), null);
  assert.equal(detectFileType(svg, IMAGE_MIMES), null);
  assert.deepEqual(detectFileType(pdf, DOCUMENT_MIMES), { mime: "application/pdf", ext: ".pdf" });
  assert.equal(detectFileType(pdf, IMAGE_MIMES), null, "PDF not allowed where only images are");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("refresh/reset tokens are stored as SHA-256 hashes", () => {
  assert.equal(hashToken("abc"), crypto.createHash("sha256").update("abc").digest("hex"));
  assert.equal(hashToken("abc").length, 64);
});

test("SMS numbers are normalised to E.164", () => {
  const { toE164 } = require("../utils/notificationUtils");
  assert.equal(toE164("0771234567"), "+94771234567");
  assert.equal(toE164("+44 20 7946 0958"), "+442079460958");
  assert.equal(toE164(""), null);
});
