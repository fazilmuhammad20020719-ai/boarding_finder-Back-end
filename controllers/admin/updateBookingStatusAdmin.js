const { query } = require("../../db");
const { approveWithinCapacity } = require("../bookings/bookingManagement");

const updateBookingStatusAdmin = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    if (!['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const current = await query("SELECT listing_id, status FROM bookings WHERE booking_id = $1", [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Admins may set any status, but approving still has to fit within the room's capacity
    if (status === 'approved' && current.rows[0].status !== 'approved') {
      const result = await approveWithinCapacity(current.rows[0].listing_id, id, current.rows[0].status);
      if (result.error) return res.status(409).json({ message: result.error, code: result.code });
      return res.json({ message: "Booking status updated successfully", booking: result.booking });
    }

    const result = await query(
      "UPDATE bookings SET status = $1, updated_at = NOW() WHERE booking_id = $2 RETURNING *",
      [status, id]
    );
    res.json({ message: "Booking status updated successfully", booking: result.rows[0] });
  } catch (err) {
    console.error("Error updating booking status:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { updateBookingStatusAdmin };
