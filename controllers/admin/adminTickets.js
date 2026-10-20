const { query } = require("../../db");
const { parsePagination, paginated } = require("../../utils/pagination");

const getAllAdminTickets = async (req, res) => {
  try {
    const sql = `
      SELECT t.*,
             COALESCE(u.name, t.contact_name) as user_name,
             COALESCE(u.email, t.contact_email) as user_email,
             COALESCE(u.role, 'guest') as user_role,
             COUNT(*) OVER() AS total_count
      FROM tickets t
      LEFT JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
      LIMIT $1 OFFSET $2;
    `;
    const page = parsePagination(req);
    const result = await query(sql, [page.limit, page.offset]);
    return res.status(200).json(paginated("tickets", result.rows, page));
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
