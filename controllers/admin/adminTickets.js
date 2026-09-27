const { query } = require("../../db");

const getAllAdminTickets = async (req, res) => {
  try {
    const sql = `
      SELECT t.*, u.name as user_name, u.email as user_email, u.role as user_role
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC;
    `;
    const result = await query(sql);
    return res.status(200).json({ tickets: result.rows });
  } catch (error) {
    console.error("Error fetching all tickets:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const updateTicketStatusAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const sql = `
      UPDATE tickets
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE ticket_id = $2
      RETURNING *;
    `;
    const result = await query(sql, [status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    return res.status(200).json({ message: "Ticket status updated", ticket: result.rows[0] });
  } catch (error) {
    console.error("Error updating ticket status:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getAllAdminTickets, updateTicketStatusAdmin };
