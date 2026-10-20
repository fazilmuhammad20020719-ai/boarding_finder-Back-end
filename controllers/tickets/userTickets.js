const { query } = require("../../db");
const { sanitizeHtml: escapeHTML } = require("../../utils/sanitize");
const { validateEmail, validateName } = require("../../utils/validators");

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

// POST /api/tickets/contact — public Contact Us form (no login required)
const createContactMessage = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ message: "Name, email, subject and message are required." });
    }
    for (const check of [validateName(name), validateEmail(email)]) {
      if (!check.valid) return res.status(400).json({ message: check.message });
    }
    if (subject.length > 200 || message.length > 5000) {
      return res.status(400).json({ message: "Subject or message is too long." });
    }

    const result = await query(
      `INSERT INTO tickets (user_id, subject, description, category, contact_name, contact_email)
       VALUES (NULL, $1, $2, 'contact', $3, $4)
       RETURNING ticket_id`,
      [escapeHTML(subject.trim()), escapeHTML(message.trim()), escapeHTML(name.trim()), email.trim().toLowerCase()]
    );

    return res.status(201).json({ message: "Message sent! We'll get back to you soon.", ticket_id: result.rows[0].ticket_id });
  } catch (error) {
    console.error("Error creating contact message:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// POST /api/tickets/report — report a listing or user for admin review
const createReport = async (req, res) => {
  try {
    const { targetType, targetId, targetName, reason, details } = req.body;
    const type = String(targetType || "").toLowerCase();

    if (!["listing", "user"].includes(type) || !reason) {
      return res.status(400).json({ message: "A valid target type and reason are required." });
    }
    if (String(reason).length > 200 || (details && String(details).length > 2000)) {
      return res.status(400).json({ message: "Report is too long." });
    }

    const label = `${type === "listing" ? "Listing" : "User"}${targetId ? ` #${targetId}` : ""}${targetName ? ` (${targetName})` : ""}`;
    const result = await query(
      `INSERT INTO tickets (user_id, subject, description, category, target_type, target_id)
       VALUES ($1, $2, $3, 'report', $4, $5)
       RETURNING ticket_id`,
      [
        req.user.id,
        escapeHTML(`[Report] ${label}: ${reason}`).slice(0, 255),
        escapeHTML(details?.trim() || reason),
        type,
        Number.isInteger(Number(targetId)) ? Number(targetId) : null,
      ]
    );

    return res.status(201).json({ message: "Report submitted. Our team will review it.", ticket_id: result.rows[0].ticket_id });
  } catch (error) {
    console.error("Error creating report:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { createTicket, getMyTickets, createContactMessage, createReport };
