const pool = require("../../db");

const updateBookingStatusAdmin = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    if (!['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const result = await pool.query(
      "UPDATE bookings SET status = $1, updated_at = NOW() WHERE booking_id = $2 RETURNING *",
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.json({ message: "Booking status updated successfully", booking: result.rows[0] });
  } catch (err) {
    console.error("Error updating booking status:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { updateBookingStatusAdmin };
