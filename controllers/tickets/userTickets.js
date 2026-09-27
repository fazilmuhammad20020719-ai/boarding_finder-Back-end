const { query } = require("../../db");
const { escapeHTML } = require("../../utils/sanitize");

const createTicket = async (req, res) => {
  try {
    const userId = req.user.id;
    const { subject, description } = req.body;

    if (!subject || !description) {
      return res.status(400).json({ message: "Subject and description are required." });
    }

    const safeSubject = escapeHTML(subject);
    const safeDescription = escapeHTML(description);

    const sql = `
      INSERT INTO tickets (user_id, subject, description)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const result = await query(sql, [userId, safeSubject, safeDescription]);

    return res.status(201).json({
      message: "Ticket submitted successfully",
      ticket: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating ticket:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getMyTickets = async (req, res) => {
  try {
    const userId = req.user.id;
    const sql = `
      SELECT * FROM tickets
      WHERE user_id = $1
      ORDER BY created_at DESC;
    `;
    const result = await query(sql, [userId]);
    return res.status(200).json({ tickets: result.rows });
  } catch (error) {
    console.error("Error fetching my tickets:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { createTicket, getMyTickets };
