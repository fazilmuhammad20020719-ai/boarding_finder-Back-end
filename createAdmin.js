require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query } = require('./db');

async function createAdmin() {
  try {
    const email = 'admin@admin.com';
    const password = 'admin';
    const hash = await bcrypt.hash(password, 10);

    const result = await query(
      "INSERT INTO users (name, email, password_hash, raw_password, role, verification_status, is_email_verified) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (email) DO NOTHING RETURNING id",
      ['System Admin', email, hash, password, 'admin', 'verified', true]
    );

    if (result.rows.length > 0) {
      console.log(`Admin created successfully!`);
    } else {
      console.log(`Admin user ${email} already exists.`);
    }
  } catch (error) {
    console.error("Error creating admin:", error);
  } finally {
    process.exit(0);
  }
}

createAdmin();
