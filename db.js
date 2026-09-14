const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test connection on startup
pool.query("SELECT NOW()")
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => {
    console.error("❌ PostgreSQL connection failed:", err.message);
    process.exit(1);
  });

// Helper function for running queries
const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
