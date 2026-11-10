const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { query } = require('../db');
const auditLog = require('../middleware/auditLog');

// ─── Authentication middleware ───────────────
// Any verified, authenticated user can read the DB viewer (GET routes).
// Delete and export operations remain restricted to admins only.
router.use(auth);

// Admin-only guard used by write/export routes
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
  }
  next();
};

// Columns tagged as sensitive — shown with special styling on the frontend.
// We intentionally expose these (hashed) values so developers can inspect
// bcrypt hashes and OTP codes during development.
const SENSITIVE_COLUMNS = new Set(['password_hash', 'email_otp', 'reset_token_hash']);

// No redaction — values are returned as-is so the Dev Panel can display them.
const redactRow = (row) => row;

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
router.delete('/tables/:tableName/:pkName/:pkValue', adminOnly, auditLog, async (req, res) => {
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
router.get('/export', adminOnly, async (req, res) => {
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
