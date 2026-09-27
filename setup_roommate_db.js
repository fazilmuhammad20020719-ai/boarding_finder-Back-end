require("dotenv").config();
const { query } = require("./db");

const createTable = async () => {
  try {
    const sql = `
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
    `;
    await query(sql);
    console.log("Table roommate_profiles created successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Error creating table:", error);
    process.exit(1);
  }
};

createTable();
