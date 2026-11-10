const jwt = require("jsonwebtoken");

/**
 * Like `auth`, but never rejects: attaches req.user when a valid Bearer token
 * is present and leaves it undefined otherwise. For public endpoints that
 * show more to signed-in users.
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
      req.user = { id: decoded.id, email: decoded.email, role: decoded.role };
    } catch {
      // invalid or expired token: treat as anonymous
    }
  }
  next();
};

module.exports = optionalAuth;
