const csrfProtection = (req, res, next) => {
  // Only check state-mutating HTTP methods
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    // In a stateless JWT API, we rely on the Custom Request Header defense.
    // Standard browsers will require a CORS preflight for custom headers,
    // which inherently prevents simple Cross-Site Request Forgery (CSRF).
    const csrfHeader = req.headers['x-csrf-token'];
    
    if (!csrfHeader || csrfHeader !== 'boarding-finder-csrf-protection') {
      return res.status(403).json({ error: 'CSRF token missing or invalid' });
    }
  }
  next();
};

module.exports = csrfProtection;
