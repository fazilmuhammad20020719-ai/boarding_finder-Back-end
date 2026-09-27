const { query } = require("../../db");

const broadcastAnnouncement = async (req, res) => {
  try {
    const { title, message, target_audience } = req.body;

    if (!title || !message) {
      return res.status(400).json({ message: "Title and message are required." });
    }

    let usersQuery = "SELECT id FROM users";
    let queryParams = [];

    if (target_audience === 'student' || target_audience === 'owner') {
      usersQuery += " WHERE role = $1";
      queryParams.push(target_audience);
    }

    const usersResult = await query(usersQuery, queryParams);
    const userIds = usersResult.rows.map(row => row.id);

    if (userIds.length === 0) {
      return res.status(404).json({ message: "No users found for the selected audience." });
    }

    // Prepare arrays for UNNEST batch insert
    const types = new Array(userIds.length).fill('system_alert');
    const titles = new Array(userIds.length).fill(title);
    const messages = new Array(userIds.length).fill(message);

    const insertSql = `
      INSERT INTO notifications (user_id, type, title, message)
      SELECT * FROM UNNEST($1::int[], $2::varchar[], $3::varchar[], $4::text[])
    `;

    await query(insertSql, [userIds, types, titles, messages]);

    return res.status(200).json({
      message: `Successfully broadcasted to ${userIds.length} users.`,
      count: userIds.length
    });
  } catch (error) {
    console.error("Error broadcasting announcement:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { broadcastAnnouncement };
