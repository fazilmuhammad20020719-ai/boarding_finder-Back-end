require("dotenv").config();
const { pool } = require("./db");

async function migrate() {
  try {
    console.log("Adding approval_status column to listings table...");
    await pool.query(`
      ALTER TABLE listings 
      ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'approved' 
      CHECK (approval_status IN ('pending', 'approved', 'rejected', 'suspended'));
    `);
    console.log("Migration successful.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    process.exit(0);
  }
}

migrate();
