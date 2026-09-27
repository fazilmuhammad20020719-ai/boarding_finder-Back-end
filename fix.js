require('dotenv').config();
const { query, pool } = require('./db.js');
async function run() {
  await query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'approved';`);
  console.log('Done');
  pool.end();
}
run();
