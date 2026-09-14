const { query } = require("../db");

const initDb = async () => {
  try {
    // ─── Core Tables ─────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id              SERIAL PRIMARY KEY,
        name            VARCHAR(100) NOT NULL,
        email           VARCHAR(255) UNIQUE NOT NULL,
        phone           VARCHAR(20),
        password_hash   VARCHAR(255) NOT NULL,
        raw_password    VARCHAR(255),
        role            VARCHAR(20) NOT NULL CHECK (role IN ('student', 'owner', 'admin')),

        -- Student-specific fields
        university      VARCHAR(200),
        course          VARCHAR(200),
        student_id      VARCHAR(50),

        -- Owner-specific fields
        property_name    VARCHAR(200),
        property_type    VARCHAR(50),
        permit_number    VARCHAR(100),
        property_address TEXT,

        -- Email / OTP verification
        is_email_verified    BOOLEAN DEFAULT FALSE,
        email_otp            VARCHAR(6),
        email_otp_expires    TIMESTAMP,

        -- Account verification (admin review)
        verification_status  VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected', 'suspended')),
        verification_docs    TEXT[],
        verification_note    TEXT,
        verified_at          TIMESTAMP,
        verified_by          INTEGER REFERENCES users(id),

        -- Owner management control over students
        account_status       VARCHAR(20) DEFAULT 'active' CHECK (account_status IN ('active', 'paused', 'removed')),
        status_changed_by    INTEGER REFERENCES users(id),
        status_changed_at    TIMESTAMP,

        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      );

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

    // ─── Migration: add new columns to existing users table ──────
    // These are safe to run repeatedly (IF NOT EXISTS).
    const migrations = [
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS raw_password VARCHAR(255);",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT FALSE;",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_otp VARCHAR(6);",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_otp_expires TIMESTAMP;",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected', 'suspended'));",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_docs TEXT[];",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_note TEXT;",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_by INTEGER REFERENCES users(id);",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) DEFAULT 'active' CHECK (account_status IN ('active', 'paused', 'removed'));",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS status_changed_by INTEGER REFERENCES users(id);",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMP;",
      // Add CHECK constraint to role if missing (ignoring error if it exists via exception handler in production, but here we just leave it for now or use a safe approach. Actually, PostgreSQL doesn't support ADD CHECK IF NOT EXISTS, so we omit altering existing role check for safety in raw script, though we added it to CREATE TABLE.)
    ];

    for (const sql of migrations) {
      await query(sql);
    }

    // Mark all existing users as verified so they aren't locked out
    await query(`
      UPDATE users
      SET is_email_verified = TRUE,
          verification_status = 'verified',
          account_status = 'active'
      WHERE verification_status IS NULL OR verification_status = 'pending'
        AND created_at < NOW() - INTERVAL '1 minute';
    `);

    console.log("✅ Database tables initialized & migrated");
  } catch (err) {
    console.error("❌ Failed to initialize database tables:", err.message);
    throw err;
  }
};

module.exports = initDb;
