const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { query } = require('../db');
const auditLog = require('../middleware/auditLog');

// ─── Admin-only access ───────────────────────
// This router exposes raw database contents, so every route requires an
// authenticated admin (anyone can sign up as a student, so "any logged-in
// user" would mean the whole internet).
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
  }
  next();
};
router.use(auth, adminOnly, auditLog);

// Columns that must never leave the server, even for admins:
// password hashes, one-time codes, and session / reset token hashes.
const SENSITIVE_COLUMNS = new Set(['password_hash', 'email_otp', 'reset_token_hash', 'token_hash']);

const redactRow = (row) => {
  const clean = {};
  for (const [key, value] of Object.entries(row)) {
    clean[key] = SENSITIVE_COLUMNS.has(key) && value != null ? '[redacted]' : value;
  }
  return clean;
};

const getTableNames = async () => {
  const result = await query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
  `);
  return result.rows.map(row => row.table_name);
};

// Only allow identifiers that are real tables / columns in the public schema.
const assertTable = async (tableName) => (await getTableNames()).includes(tableName);

const getColumns = async (tableName) => {
  const result = await query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
  `, [tableName]);
  return result.rows;
};

// Get all tables in the database
router.get('/tables', async (req, res) => {
  try {
    res.json({ tables: await getTableNames() });
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

// Get data for a specific table
router.get('/tables/:tableName', async (req, res) => {
  const { tableName } = req.params;

  try {
    if (!(await assertTable(tableName))) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    const columns = await getColumns(tableName);
    // Limit to 100 rows for performance
    const dataResult = await query(`SELECT * FROM "${tableName}" LIMIT 100`);

    res.json({
      columns,
      data: dataResult.rows.map(redactRow)
    });
  } catch (error) {
    console.error(`Error fetching data for table ${tableName}:`, error);
    res.status(500).json({ error: `Failed to fetch data for table ${tableName}` });
  }
});

// Delete a specific row from a table — admin only
router.delete('/tables/:tableName/:pkName/:pkValue', async (req, res) => {
  const { tableName, pkName, pkValue } = req.params;

  try {
    if (!(await assertTable(tableName))) {
      return res.status(400).json({ error: 'Invalid table name' });
    }
    // The audit trail is append-only
    if (tableName === 'audit_logs') {
      return res.status(403).json({ error: 'Audit logs cannot be deleted' });
    }
    const columns = await getColumns(tableName);
    if (!columns.some(c => c.column_name === pkName)) {
      return res.status(400).json({ error: 'Invalid column name' });
    }

    await query(`DELETE FROM "${tableName}" WHERE "${pkName}" = $1`, [pkValue]);
    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (error) {
    console.error(`Error deleting record from ${tableName}:`, error);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

// Export database — admin only
router.get('/export', async (req, res) => {
  const withData = req.query.withData === 'true';

  try {
    const dbExport = {};

    for (const tableName of await getTableNames()) {
      dbExport[tableName] = {
        schema: await getColumns(tableName),
        data: []
      };

      if (withData) {
        const dataResult = await query(`SELECT * FROM "${tableName}"`);
        dbExport[tableName].data = dataResult.rows.map(redactRow);
      }
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="database_export${withData ? '_with_data' : '_schema_only'}.json"`);
    res.send(JSON.stringify(dbExport, null, 2));

  } catch (error) {
    console.error('Error exporting database:', error);
    res.status(500).json({ error: 'Failed to export database' });
  }
});

module.exports = router;
