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

    // ─── Auth sessions: hashed, rotating refresh tokens ──────────
    await query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash  VARCHAR(64) NOT NULL UNIQUE,
        expires_at  TIMESTAMP NOT NULL,
        revoked_at  TIMESTAMP,
        created_at  TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    `);

    // ─── Payment gateway orders & listing promotions ─────────────
    await query(`
      CREATE TABLE IF NOT EXISTS payment_orders (
        order_id            VARCHAR(40) PRIMARY KEY,
        purpose             VARCHAR(20) NOT NULL CHECK (purpose IN ('booking', 'promotion')),
        user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        booking_id          INTEGER,
        listing_id          INTEGER,
        plan_id             VARCHAR(20),
        amount              NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
        currency            VARCHAR(3) NOT NULL,
        payment_type        VARCHAR(50),
        status              VARCHAR(20) NOT NULL DEFAULT 'pending',
        payhere_payment_id  VARCHAR(50),
        method              VARCHAR(30),
        created_at          TIMESTAMP DEFAULT NOW(),
        updated_at          TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id);

      CREATE TABLE IF NOT EXISTS promoted_listings (
        id          SERIAL PRIMARY KEY,
        listing_id  INTEGER NOT NULL,
        owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id     VARCHAR(20) NOT NULL,
        order_id    VARCHAR(40) UNIQUE,
        starts_at   TIMESTAMP NOT NULL DEFAULT NOW(),
        ends_at     TIMESTAMP NOT NULL,
        created_at  TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_promoted_listings_active ON promoted_listings(listing_id, ends_at);
    `);

    // ─── Migration: add new columns to existing users table ──────
    // These are safe to run repeatedly (IF NOT EXISTS).
    const migrations = [
      // Plain-text passwords must never be stored — drop the legacy column.
      "ALTER TABLE users DROP COLUMN IF EXISTS raw_password;",
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
      "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS category_ratings JSONB DEFAULT '{}'::jsonb;",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash VARCHAR(64);",
      "ALTER TABLE listings ADD COLUMN IF NOT EXISTS virtual_tour_url VARCHAR(500);",
      // Previously applied by one-off scripts (updateSchema.js, migrate.js, add_location_col.js)
      "ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;",
      "ALTER TABLE listings ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'approved';",
      "ALTER TABLE listings ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;",
      "ALTER TABLE listings ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 8);",
      "ALTER TABLE listings ADD COLUMN IF NOT EXISTS longitude NUMERIC(11, 8);",
      "ALTER TABLE listings ADD COLUMN IF NOT EXISTS ical_token VARCHAR(64);",
      "ALTER TABLE listings ADD COLUMN IF NOT EXISTS ical_import_url VARCHAR(500);",
      "ALTER TABLE listings ADD COLUMN IF NOT EXISTS ical_synced_at TIMESTAMP;",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;",
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
      WHERE verification_status IS NULL;
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

    // ─── Columns previously added by one-off scripts (add_location_col.js etc.) ───
    for (const sql of [
      "ALTER TABLE roommate_profiles ADD COLUMN IF NOT EXISTS location VARCHAR(255);",
      "ALTER TABLE roommate_profiles ADD COLUMN IF NOT EXISTS gender VARCHAR(20);",
      "ALTER TABLE roommate_profiles ADD COLUMN IF NOT EXISTS preferred_gender VARCHAR(20);",
    ]) {
      await query(sql);
    }

    // ─── Admin audit trail (append-only) ─────────────
    await query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id          BIGSERIAL PRIMARY KEY,
        admin_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
        method      VARCHAR(10) NOT NULL,
        path        VARCHAR(255) NOT NULL,
        params      JSONB,
        body        JSONB,
        status_code INTEGER,
        ip          VARCHAR(64),
        created_at  TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON audit_logs(admin_id);
    `);

    // ─── Performance indexes for frequently filtered columns ─────
    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_listings_approval_status ON listings(approval_status);",
      "CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);",
      "CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings(created_at DESC);",
      "CREATE INDEX IF NOT EXISTS idx_users_verification_status ON users(verification_status);",
      "CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);",
      "CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token_hash) WHERE reset_token_hash IS NOT NULL;",
      "CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);",
      "CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);",
      "CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);",
      "CREATE INDEX IF NOT EXISTS idx_payments_owner ON payments(owner_id);",
      "CREATE INDEX IF NOT EXISTS idx_maintenance_owner ON maintenance_requests(owner_id);",
      "CREATE INDEX IF NOT EXISTS idx_maintenance_student ON maintenance_requests(student_id);",
      "CREATE INDEX IF NOT EXISTS idx_forum_posts_category ON forum_posts(category);",
      "CREATE INDEX IF NOT EXISTS idx_forum_comments_post ON forum_comments(post_id);",
      "CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);",
      "CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);",
      "CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);",
    ];
    for (const sql of indexes) {
      await query(sql);
    }

    // Trigram index makes location ILIKE '%term%' searches fast. pg_trgm is a
    // trusted extension on PostgreSQL 13+, but skip quietly if not permitted.
    try {
      await query("CREATE EXTENSION IF NOT EXISTS pg_trgm;");
      await query("CREATE INDEX IF NOT EXISTS idx_listings_location_trgm ON listings USING gin (location gin_trgm_ops);");
    } catch (e) {
      console.warn("⚠️ pg_trgm unavailable, skipping location search index:", e.message);
    }

    console.log("✅ Database initialized successfully.");
  } catch (error) {
    console.error("❌ Failed to initialize database tables:", error.message);
    throw error;
  }
};

module.exports = initDb;
