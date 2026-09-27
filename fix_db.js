require('dotenv').config();
const { query } = require('./db');

async function fix() {
  try {
    await query("ALTER TABLE listings ADD COLUMN IF NOT EXISTS university VARCHAR(200);");
    console.log("Column added");
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
fix();
