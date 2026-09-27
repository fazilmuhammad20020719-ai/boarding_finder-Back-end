require("dotenv").config();
const { query } = require("./db");

async function run() {
  try {
    await query("ALTER TABLE roommate_profiles ADD COLUMN location VARCHAR(255);");
    console.log("Successfully added location column.");
  } catch (err) {
    if (err.code === '42701') {
      console.log("Column location already exists.");
    } else {
      console.error(err);
    }
  } finally {
    process.exit();
  }
}

run();
