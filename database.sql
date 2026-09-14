-- =============================================
-- BoardingFinder — Full Database Setup
-- Run with: sudo -u postgres psql -f database.sql
-- =============================================

-- 1. Create the database user
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'admin_user') THEN
    CREATE ROLE admin_user WITH LOGIN PASSWORD 'Boarding@123';
  END IF;
END
$$;

-- 2. Create the database
SELECT 'CREATE DATABASE boarding_db OWNER admin_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'boarding_db')\gexec

-- 3. Grant privileges
GRANT ALL PRIVILEGES ON DATABASE boarding_db TO admin_user;

-- 4. Connect to the new database to create tables
\c boarding_db

-- 5. Grant schema privileges (required for PostgreSQL 15+)
GRANT ALL ON SCHEMA public TO admin_user;

-- =============================================
-- TABLES
-- =============================================

-- 6. Users table (students + owners + admins)
CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  email             VARCHAR(255) UNIQUE NOT NULL,
  phone             VARCHAR(20),
  password_hash     VARCHAR(255) NOT NULL,
  raw_password      VARCHAR(255), -- For development purposes only
  role              VARCHAR(20) NOT NULL CHECK (role IN ('student', 'owner', 'admin')),

  -- Student-specific fields
  university        VARCHAR(200),
  course            VARCHAR(200),
  student_id        VARCHAR(50),

  -- Owner-specific fields
  property_name     VARCHAR(200),
  property_type     VARCHAR(50),
  permit_number     VARCHAR(100),
  property_address  TEXT,

  -- Email/OTP verification
  is_email_verified    BOOLEAN DEFAULT FALSE,
  email_otp            VARCHAR(6),
  email_otp_expires    TIMESTAMP,

  -- Account verification status (both owners & students)
  verification_status  VARCHAR(20) DEFAULT 'pending'
                       CHECK (verification_status IN ('pending', 'verified', 'rejected', 'suspended')),
  verification_docs    TEXT[],
  verification_note    TEXT,
  verified_at          TIMESTAMP,
  verified_by          INTEGER REFERENCES users(id),

  -- Owner management: allows owner to pause/suspend a student
  account_status       VARCHAR(20) DEFAULT 'active'
                       CHECK (account_status IN ('active', 'paused', 'removed')),
  status_changed_by    INTEGER REFERENCES users(id),
  status_changed_at    TIMESTAMP,

  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- 7. Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- 8. Set ownership so admin_user can manage the table
ALTER TABLE users OWNER TO admin_user;

-- 9. Listings table
CREATE TABLE IF NOT EXISTS listings (
  listing_id        SERIAL PRIMARY KEY,
  owner_id          INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title             VARCHAR(255) NOT NULL,
  description       TEXT NOT NULL,
  price             NUMERIC(10, 2) NOT NULL,
  security_deposit  NUMERIC(10, 2),
  location          VARCHAR(255) NOT NULL,
  latitude          NUMERIC(10, 8),
  longitude         NUMERIC(11, 8),
  amenities         TEXT,
  image_urls        TEXT[],
  approval_status   VARCHAR(20) DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'suspended')),
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- 10. Indexes for listings
CREATE INDEX IF NOT EXISTS idx_listings_owner_id ON listings(owner_id);

-- 11. Set ownership for listings
ALTER TABLE listings OWNER TO admin_user;

-- 12. Bookings table
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

-- 13. Indexes for bookings
CREATE INDEX IF NOT EXISTS idx_bookings_listing_id ON bookings(listing_id);
CREATE INDEX IF NOT EXISTS idx_bookings_seeker_id ON bookings(seeker_id);
CREATE INDEX IF NOT EXISTS idx_bookings_owner_id ON bookings(owner_id);

-- 14. Set ownership for bookings
ALTER TABLE bookings OWNER TO admin_user;

-- 15. Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  conversation_id SERIAL PRIMARY KEY,
  listing_id INTEGER REFERENCES listings(listing_id) ON DELETE CASCADE,
  seeker_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(listing_id, seeker_id, owner_id)
);

-- 16. Messages table
CREATE TABLE IF NOT EXISTS messages (
  message_id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 17. Set ownership and indexes for messaging
ALTER TABLE conversations OWNER TO admin_user;
ALTER TABLE messages OWNER TO admin_user;
CREATE INDEX IF NOT EXISTS idx_conversations_seeker ON conversations(seeker_id);
CREATE INDEX IF NOT EXISTS idx_conversations_owner ON conversations(owner_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

-- 18. Reviews table
CREATE TABLE IF NOT EXISTS reviews (
  review_id SERIAL PRIMARY KEY,
  listing_id INTEGER REFERENCES listings(listing_id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 19. Set ownership and indexes for reviews
ALTER TABLE reviews OWNER TO admin_user;
CREATE INDEX IF NOT EXISTS idx_reviews_listing ON reviews(listing_id);

-- 20. Saved Listings table
CREATE TABLE IF NOT EXISTS saved_listings (
  saved_id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES listings(listing_id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, listing_id)
);

-- 21. Set ownership and indexes for saved listings
ALTER TABLE saved_listings OWNER TO admin_user;
CREATE INDEX IF NOT EXISTS idx_saved_listings_user ON saved_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_listings_listing ON saved_listings(listing_id);

-- Done!
SELECT 'o. Database setup complete!' AS status;
