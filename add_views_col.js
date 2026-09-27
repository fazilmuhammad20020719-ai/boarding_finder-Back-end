require('dotenv').config();
const { query } = require('./db');

async function fix() {
  try {
    await query("ALTER TABLE listings ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;");
    console.log("Views column added to listings table successfully");
  } catch (err) {
    console.error("Error adding views column:", err);
  } finally {
    process.exit();
  }
}
fix();
