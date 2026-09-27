require("dotenv").config();
const { Client } = require("pg");

const run = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  try {
    await client.connect();
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
    await client.query(sql);
    console.log("Table roommate_profiles created successfully.");
  } catch (error) {
    console.error("Error creating table:", error);
  } finally {
    await client.end();
  }
};

run();
