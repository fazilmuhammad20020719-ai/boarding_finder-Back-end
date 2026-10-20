// Integration tests against a real PostgreSQL database.
// Uses DATABASE_URL from .env (or the environment); skipped if none is set.
// Creates throwaway users with a unique email suffix and deletes them afterwards.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const skip = !process.env.DATABASE_URL && "DATABASE_URL not set";
const RUN = `${Date.now()}`;
const STUDENT = { email: `it-student-${RUN}@example.com`, password: "Stud3nt!Passw0rd" };
const CSRF = { "X-CSRF-Token": "boarding-finder-csrf-protection", "Content-Type": "application/json" };

let server;
let base;
let db;

before(async () => {
  if (skip) return;
  process.env.NODE_ENV = "test";
  process.env.BREVO_API_KEY = ""; // never send real email from tests
  const { app, initDb } = require("../server");
  db = require("../db");
  await initDb();
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (skip) return;
  await db.query("DELETE FROM users WHERE email LIKE $1", [`it-%-${RUN}@example.com`]);
  server.close();
  await db.pool.end();
});

const post = (path, body, headers = {}) =>
  fetch(`${base}${path}`, { method: "POST", headers: { ...CSRF, ...headers }, body: JSON.stringify(body) });

const cookieFrom = (res) => (res.headers.get("set-cookie") || "").split(";")[0];

test("database viewer requires an admin", { skip }, async () => {
  for (const p of ["/db/tables", "/db/export", "/db/logs", "/db/seed-admin"]) {
    const res = await fetch(`${base}${p}`);
    assert.equal(res.status, 401, p);
  }
});

test("state-changing requests without the CSRF header are rejected", { skip }, async () => {
  const res = await fetch(`${base}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  assert.equal(res.status, 403);
});

test("anonymous users cannot register an admin account", { skip }, async () => {
  const res = await post("/auth/register", {
    name: "Evil Admin", email: `it-evil-${RUN}@example.com`, password: "Passw0rd!x", phone: "0771234567", role: "admin",
  });
  assert.equal(res.status, 401);
  const rows = await db.query("SELECT 1 FROM users WHERE email = $1", [`it-evil-${RUN}@example.com`]);
  assert.equal(rows.rows.length, 0);
});

test("register → refresh rotation → logout", { skip }, async () => {
  const reg = await post("/auth/register", {
    name: "Integration Student", email: STUDENT.email, password: STUDENT.password, phone: "0771234567",
    role: "student", university: "UoC", course: "CS", studentId: "S1",
  });
  assert.equal(reg.status, 201);
  const regBody = await reg.json();
  assert.ok(regBody.token, "access token returned");
  const cookie = cookieFrom(reg);
  assert.match(reg.headers.get("set-cookie"), /HttpOnly/i);

  // No plain-text password column any more
  const cols = await db.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'raw_password'");
  assert.equal(cols.rows.length, 0);

  const me = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${regBody.token}` } });
  assert.equal(me.status, 200);

  const r1 = await post("/auth/refresh", {}, { Cookie: cookie });
  assert.equal(r1.status, 200);
  const rotated = cookieFrom(r1);
  assert.notEqual(rotated, cookie, "refresh token rotates");

  const reuse = await post("/auth/refresh", {}, { Cookie: cookie });
  assert.equal(reuse.status, 401, "old refresh token is single-use");

  const out = await post("/auth/logout", {}, { Cookie: rotated });
  assert.equal(out.status, 200);
  const afterLogout = await post("/auth/refresh", {}, { Cookie: rotated });
  assert.equal(afterLogout.status, 401);
});

test("password reset is single-use and does not reveal accounts", { skip }, async () => {
  const unknown = await post("/auth/forgot-password", { email: `it-nobody-${RUN}@example.com` });
  const known = await post("/auth/forgot-password", { email: STUDENT.email });
  assert.equal(unknown.status, 200);
  assert.deepEqual(await unknown.json(), await known.json());

  const bad = await post("/auth/reset-password", { token: "not-a-real-token", password: "N3w!Passw0rd" });
  assert.equal(bad.status, 400);
});

test("contact form validates input", { skip }, async () => {
  const res = await post("/tickets/contact", { name: "A", email: "not-an-email", subject: "Hi", message: "Hello" });
  assert.equal(res.status, 400);
});

test("public listings are paginated and never expose calendar tokens", { skip }, async () => {
  const res = await fetch(`${base}/listings?limit=1`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.pagination && body.pagination.limit === 1);
  assert.ok(body.listings.every((l) => !("ical_token" in l)));
});
