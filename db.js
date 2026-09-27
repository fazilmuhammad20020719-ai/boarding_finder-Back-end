const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test connection on startup and run simple migrations
pool.query("SELECT NOW()")
  .then(async () => {
    console.log("✅ Connected to PostgreSQL");
    // Auto-migrate new columns
    try {
      await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'approved';`);
      await pool.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;`);
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tickets (
          ticket_id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          subject VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          status VARCHAR(20) DEFAULT 'open',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS platform_settings (
          id SERIAL PRIMARY KEY,
          setting_key VARCHAR(100) UNIQUE NOT NULL,
          setting_value TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Seed default settings if they don't exist
      await pool.query(`
        INSERT INTO platform_settings (setting_key, setting_value)
        VALUES 
          ('platform_fee_percentage', '5'),
          ('maintenance_mode', 'false'),
          ('terms_of_service_url', 'https://boardingfinder.com/terms')
        ON CONFLICT (setting_key) DO NOTHING;
      `);

      console.log("✅ Database auto-migrations completed");
    } catch (e) {
      console.error("⚠️ Migration error:", e.message);
    }
  })
  .catch((err) => {
    console.error("❌ PostgreSQL connection failed:", err.message);
    process.exit(1);
  });

// Helper function for running queries
const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
