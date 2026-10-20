// Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='StrongPass#1' node createAdmin.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query } = require('./db');
const { validatePassword, validateEmail } = require('./utils/validators');

async function createAdmin() {
  try {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables.");
      process.exit(1);
    }
    for (const check of [validateEmail(email), validatePassword(password)]) {
      if (!check.valid) {
        console.error(check.message);
        process.exit(1);
      }
    }

    const hash = await bcrypt.hash(password, 12);

    const result = await query(
      "INSERT INTO users (name, email, password_hash, role, verification_status, is_email_verified) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (email) DO NOTHING RETURNING id",
      ['System Admin', email.toLowerCase(), hash, 'admin', 'verified', true]
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
