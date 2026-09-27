const { query } = require('./db');

async function run() {
  try {
    await query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;`);
    await query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;`);
    console.log("Successfully added is_paused and views to listings table.");
    process.exit(0);
  } catch (err) {
    console.error("Failed to update schema", err);
    process.exit(1);
  }
}

run();
