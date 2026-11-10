const pool = require("../../db");
const { createNotification } = require("../../utils/notificationUtils");

const STATUS_MESSAGES = {
  approved: (t) => ["Listing approved", `Your listing "${t}" has been approved and is now visible to students.`],
  pending: (t) => ["Listing under review", `Your listing "${t}" is being reviewed by an admin and is hidden until approved.`],
  suspended: (t) => ["Listing suspended", `Your listing "${t}" has been suspended by an admin and is hidden from students. Please contact support.`],
  rejected: (t) => ["Listing rejected", `Your listing "${t}" was not approved. Please contact support for details.`],
};

const updateListingStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'approved', 'rejected', 'suspended'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid status value provided." });
  }

  try {
    const result = await pool.query(
      `UPDATE listings 
       SET approval_status = $1, updated_at = NOW() 
       WHERE listing_id = $2 
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Listing not found." });
    }

    const { ical_token, ical_import_url, ...listing } = result.rows[0];
    const [title, message] = STATUS_MESSAGES[status](listing.title);
    await createNotification(listing.owner_id, 'system_alert', title, message, '/my-listings');

    res.status(200).json({
      message: "Listing status updated successfully",
      listing
    });
  } catch (err) {
    console.error("Error updating listing status:", err);
    res.status(500).json({ message: "Server error while updating listing status" });
  }
};

module.exports = { updateListingStatus };
