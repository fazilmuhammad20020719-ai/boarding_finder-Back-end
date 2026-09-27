require("dotenv").config();
const { query } = require("./db");

const checkTable = async () => {
  try {
    const result = await query("SELECT * FROM roommate_profiles");
    console.log("Table exists! Rows:", result.rows.length);
  } catch (error) {
    console.error("Table does not exist or error:", error.message);
  } finally {
    process.exit(0);
  }
};
setTimeout(checkTable, 1000); // Wait for pool to connect
