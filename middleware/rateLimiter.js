// ─────────────────────────────────────────────────────────────
//  rateLimiter.js  –  In-memory rate-limiting middleware
// ─────────────────────────────────────────────────────────────
// Tracks attempts per IP (or IP + key) using a sliding-window
// approach stored in a plain Map.  No external dependencies.
//
// Usage:
//   const { createRateLimiter } = require("./rateLimiter");
//   const loginLimiter = createRateLimiter({ windowMs: 15*60*1000, max: 5 });
//   router.post("/login", loginLimiter, loginController);
// ─────────────────────────────────────────────────────────────

/**
 * @param {Object} opts
 * @param {number} opts.windowMs  – Time window in milliseconds (default: 15 min)
 * @param {number} opts.max       – Max requests per window (default: 5)
 * @param {string} opts.message   – Error message sent when limit exceeded
 * @param {function} [opts.keyGenerator] – (req) => string  Custom key (default: IP)
 */
function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 5,
  message = "Too many attempts. Please try again later.",
  keyGenerator,
} = {}) {
  // Map<string, { count: number, resetTime: number }>
  const store = new Map();

  // Periodic cleanup so the Map doesn't grow unbounded
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetTime) {
        store.delete(key);
      }
    }
  }, windowMs);

  // Allow the interval to not keep the process alive
  if (cleanupInterval.unref) cleanupInterval.unref();

  return (req, res, next) => {
    const key = keyGenerator
      ? keyGenerator(req)
      : req.ip || req.connection?.remoteAddress || "unknown";

    const now = Date.now();
    let entry = store.get(key);

    // First request or window expired → reset
    if (!entry || now > entry.resetTime) {
      entry = { count: 1, resetTime: now + windowMs };
      store.set(key, entry);
      setRateLimitHeaders(res, max, max - 1, entry.resetTime);
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.resetTime - now) / 1000);
      setRateLimitHeaders(res, max, 0, entry.resetTime);
      res.set("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        message,
        retryAfter: retryAfterSec,
      });
    }

    setRateLimitHeaders(res, max, max - entry.count, entry.resetTime);
    return next();
  };
}

function setRateLimitHeaders(res, limit, remaining, resetTime) {
  res.set("X-RateLimit-Limit", String(limit));
  res.set("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  res.set("X-RateLimit-Reset", String(Math.ceil(resetTime / 1000)));
}

module.exports = { createRateLimiter };
