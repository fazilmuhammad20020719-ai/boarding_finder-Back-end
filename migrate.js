require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  try {
    console.log("Starting database migrations...");

    // 1. Bookings table
    console.log("Creating bookings table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        booking_id        SERIAL PRIMARY KEY,
        listing_id        INTEGER REFERENCES listings(listing_id) ON DELETE CASCADE,
        seeker_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
        owner_id          INTEGER REFERENCES users(id) ON DELETE CASCADE,
        move_in_date      DATE NOT NULL,
        duration_months   INTEGER NOT NULL DEFAULT 1,
        status            VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
        total_amount      NUMERIC(10, 2),
        message           TEXT,
        created_at        TIMESTAMP DEFAULT NOW(),
        updated_at        TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_bookings_listing_id ON bookings(listing_id);
      CREATE INDEX IF NOT EXISTS idx_bookings_seeker_id ON bookings(seeker_id);
      CREATE INDEX IF NOT EXISTS idx_bookings_owner_id ON bookings(owner_id);
    `);
    
    // 2. Add missing columns to listings
    console.log("Updating listings table schemas...");
    await pool.query('ALTER TABLE listings ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 8), ADD COLUMN IF NOT EXISTS longitude NUMERIC(11, 8);');
    
    // 3. Messaging system tables
    console.log("Creating messaging tables (conversations & messages)...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        conversation_id SERIAL PRIMARY KEY,
        listing_id INTEGER REFERENCES listings(listing_id) ON DELETE CASCADE,
        seeker_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(listing_id, seeker_id, owner_id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        message_id SERIAL PRIMARY KEY,
        conversation_id INTEGER REFERENCES conversations(conversation_id) ON DELETE CASCADE,
        sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        message_text TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_seeker ON conversations(seeker_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_owner ON conversations(owner_id);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    `);

    // 4. Reviews system table
    console.log("Creating reviews table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        review_id SERIAL PRIMARY KEY,
        listing_id INTEGER REFERENCES listings(listing_id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_reviews_listing ON reviews(listing_id);
    `);

    // 5. Saved Listings table
    console.log("Creating saved_listings table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS saved_listings (
        saved_id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        listing_id INTEGER REFERENCES listings(listing_id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, listing_id)
      );
      CREATE INDEX IF NOT EXISTS idx_saved_listings_user ON saved_listings(user_id);
      CREATE INDEX IF NOT EXISTS idx_saved_listings_listing ON saved_listings(listing_id);
    `);

    // Try setting ownership (fails on non-superuser, ignored gracefully)
    try {
        await pool.query(`ALTER TABLE bookings OWNER TO admin_user;`);
        await pool.query(`ALTER TABLE conversations OWNER TO admin_user;`);
        await pool.query(`ALTER TABLE messages OWNER TO admin_user;`);
    } catch(e) {} 
    
    console.log("✅ All migrations completed successfully!");
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await pool.end();
  }
}

migrate();
