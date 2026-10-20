const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { query } = require("../db");

// Short-lived access token (sent in the Authorization header, kept in memory by the client)
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_EXPIRES_IN || "15m";
// Long-lived refresh token (HTTP-only cookie, rotated on every use)
const REFRESH_TOKEN_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 30);
const REFRESH_COOKIE = "bf_refresh";

const isProduction = process.env.NODE_ENV === "production";

// Frontend (Vercel) and API live on different sites in production, so the cookie
// must be SameSite=None; Secure. CSRF is still blocked by the X-CSRF-Token header
// check + CORS allow-list (see middleware/csrf.js).
const cookieOptions = () => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/api/auth",
  maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
});

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const signAccessToken = (user) =>
  jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });

/**
 * Create a refresh token for the user, store its hash, and set the cookie.
 * @returns {string} a new access token
 */
const issueSession = async (res, user) => {
  const refreshToken = crypto.randomBytes(48).toString("hex");
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' days')::interval)`,
    [user.id, hashToken(refreshToken), String(REFRESH_TOKEN_DAYS)]
  );
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions());
  return signAccessToken(user);
};

/**
 * Validate and rotate the refresh token from the request cookie.
 * @returns {Promise<{accessToken: string, user: object} | null>}
 */
const rotateSession = async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (!refreshToken) return null;

  const result = await query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
     RETURNING user_id`,
    [hashToken(refreshToken)]
  );
  if (result.rows.length === 0) return null;

  const userResult = await query(
    "SELECT id, email, role, account_status FROM users WHERE id = $1",
    [result.rows[0].user_id]
  );
  const user = userResult.rows[0];
  if (!user || user.account_status === "paused" || user.account_status === "removed") {
    return null;
  }

  const accessToken = await issueSession(res, user);
  return { accessToken, user };
};

const revokeSession = async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (refreshToken) {
    await query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1", [hashToken(refreshToken)]);
  }
  const { maxAge, ...clearOptions } = cookieOptions();
  res.clearCookie(REFRESH_COOKIE, clearOptions);
};

/** Revoke every refresh token for a user (e.g. after a password reset). */
const revokeAllSessions = (userId) =>
  query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);

module.exports = { issueSession, rotateSession, revokeSession, revokeAllSessions, hashToken };
