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
      "ALTER TABLE listings ADD COLUMN IF NOT EXISTS university VARCHAR(200);",
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
      CREATE TABLE IF NOT EXISTS roommate_profiles (
        profile_id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        age INTEGER,
        occupation VARCHAR(100),
        budget_min NUMERIC(10, 2),
        budget_max NUMERIC(10, 2),
        bio TEXT,
        tags TEXT[],
        avatar_url VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS roommate_passes (
        id SERIAL PRIMARY KEY,
        passer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        passed_on_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(passer_id, passed_on_id)
      );

      CREATE TABLE IF NOT EXISTS roommate_connections (
        id SERIAL PRIMARY KEY,
        requester_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(requester_id, receiver_id)
      );

      CREATE TABLE IF NOT EXISTS forum_posts (
        id SERIAL PRIMARY KEY,
        author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        excerpt TEXT,
        content TEXT NOT NULL,
        category VARCHAR(100),
        views INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS forum_comments (
        id SERIAL PRIMARY KEY,
        post_id INTEGER REFERENCES forum_posts(id) ON DELETE CASCADE,
        author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS forum_upvotes (
        id SERIAL PRIMARY KEY,
        post_id INTEGER REFERENCES forum_posts(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(post_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS leases (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER REFERENCES bookings(booking_id) ON DELETE CASCADE UNIQUE,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        listing_id INTEGER REFERENCES listings(listing_id) ON DELETE CASCADE,
        rent_amount NUMERIC(10, 2),
        start_date DATE,
        end_date DATE,
        terms TEXT,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'active', 'terminated')),
        student_signature VARCHAR(255),
        signed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        transaction_id VARCHAR(50) UNIQUE NOT NULL,
        booking_id INTEGER REFERENCES bookings(booking_id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(10, 2) NOT NULL,
        payment_type VARCHAR(50) NOT NULL,
        method VARCHAR(50),
        status VARCHAR(20) DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS maintenance_requests (
        id SERIAL PRIMARY KEY,
        ticket_id VARCHAR(50) UNIQUE NOT NULL,
        booking_id INTEGER REFERENCES bookings(booking_id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        listing_id INTEGER REFERENCES listings(listing_id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        urgency VARCHAR(50),
        description TEXT,
        status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50),
        title VARCHAR(255),
        message TEXT,
        link VARCHAR(255),
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS calendar_blocks (
        id SERIAL PRIMARY KEY,
        listing_id INTEGER REFERENCES listings(listing_id) ON DELETE CASCADE,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        reason VARCHAR(50) DEFAULT 'manual',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✅ Database initialized successfully.");
  } catch (error) {
    console.error("❌ Failed to initialize database tables:", error.message);
    throw error;
  }
};

module.exports = initDb;
