const express = require('express');
const router = express.Router();
const { query } = require('../db');

// Quick fix for the missing raw_password column issue
router.get('/logs', (req, res) => {
  res.sendFile('/root/.pm2/logs/boarding-api-error.log');
});

router.get('/fix', async (req, res) => {
  try {
    await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS raw_password VARCHAR(255);');
    res.json({ message: "Successfully added raw_password column! You can now register." });
  } catch (error) {
    console.error('Error fixing db:', error);
    res.status(500).json({ error: 'Failed to fix database: ' + error.message });
  }
});

// Seed an admin user
router.get('/seed-admin', async (req, res) => {
  try {
    const bcrypt = require("bcryptjs");

    // Step 1: Find ALL check constraints on the users table and drop them
    const constraints = await query(`
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'users' AND con.contype = 'c'
    `);

    for (const row of constraints.rows) {
      await query(`ALTER TABLE users DROP CONSTRAINT "${row.conname}";`);
    }

    // Step 2: Re-add the constraint WITH 'admin' included
    await query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('student', 'owner', 'admin'));`);

    // Step 3: Insert the admin user
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash('admin123', salt);

    await query(`
      INSERT INTO users (name, email, phone, password_hash, raw_password, role)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO NOTHING
    `, ['System Admin', 'admin@boardingfinder.com', '0000000000', passwordHash, 'admin123', 'admin']);

    res.json({ message: "Admin user created successfully! Email: admin@boardingfinder.com / Password: admin123" });
  } catch (error) {
    console.error('Error seeding admin:', error);
    res.status(500).json({ error: 'Failed to seed admin: ' + error.message });
  }
});

// Get all tables in the database
router.get('/tables', async (req, res) => {
  try {
    const result = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);
    const tables = result.rows.map(row => row.table_name);
    res.json({ tables });
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

// Get data for a specific table
router.get('/tables/:tableName', async (req, res) => {
  const { tableName } = req.params;
  
  // Basic validation to prevent SQL injection (only allow alphanumeric and underscores)
  if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  try {
    // 1. Get column information
    const colResult = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1
    `, [tableName]);
    
    // 2. Get table data (limit to 100 rows for performance)
    const dataResult = await query(`SELECT * FROM "${tableName}" LIMIT 100`);

    res.json({
      columns: colResult.rows,
      data: dataResult.rows
    });
  } catch (error) {
    console.error(`Error fetching data for table ${tableName}:`, error);
    res.status(500).json({ error: `Failed to fetch data for table ${tableName}` });
  }
});

// Delete a specific row from a table
router.delete('/tables/:tableName/:pkName/:pkValue', async (req, res) => {
  const { tableName, pkName, pkValue } = req.params;

  // Basic validation to prevent SQL injection
  if (!/^[a-zA-Z0-9_]+$/.test(tableName) || !/^[a-zA-Z0-9_]+$/.test(pkName)) {
    return res.status(400).json({ error: 'Invalid table or column name' });
  }

  try {
    await query(`DELETE FROM "${tableName}" WHERE "${pkName}" = $1`, [pkValue]);
    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (error) {
    console.error(`Error deleting record from ${tableName}:`, error);
    res.status(500).json({ error: `Failed to delete record: ${error.message}` });
  }
});

// Export database
router.get('/export', async (req, res) => {
  const withData = req.query.withData === 'true';
  
  try {
    const dbExport = {};

    // Get all tables
    const tablesResult = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);
    
    for (const row of tablesResult.rows) {
      const tableName = row.table_name;
      
      // Get schema
      const colResult = await query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [tableName]);

      dbExport[tableName] = {
        schema: colResult.rows,
        data: []
      };

      // Get data if requested
      if (withData) {
        const dataResult = await query(`SELECT * FROM "${tableName}"`);
        dbExport[tableName].data = dataResult.rows;
      }
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="database_export${withData ? '_with_data' : '_schema_only'}.json"`);
    res.send(JSON.stringify(dbExport, null, 2));

  } catch (error) {
    console.error('Error exporting database:', error);
    res.status(500).json({ error: 'Failed to export database: ' + error.message });
  }
});

module.exports = router;
