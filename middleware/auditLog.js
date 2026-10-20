const { query } = require("../db");

/**
 * Records every successful state-changing request made by an admin
 * (who did what, to which resource, from where) in the audit_logs table.
 * Mount after the auth middleware so req.user is set.
 */
const auditLog = (req, res, next) => {
  if (req.method === "GET" || req.method === "OPTIONS") return next();

  res.on("finish", () => {
    if (res.statusCode >= 400 || !req.user || req.user.role !== "admin") return;

    // Never store secrets in the log
    const { password, token, ...body } = req.body || {};
    query(
      `INSERT INTO audit_logs (admin_id, method, path, params, body, status_code, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.user.id, req.method, req.baseUrl + req.route?.path, req.params, body, res.statusCode, req.ip]
    ).catch((err) => console.error("❌ Failed to write audit log:", err.message));
  });

  next();
};

module.exports = auditLog;
