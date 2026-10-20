const { query } = require("../../db");
const { streamPrivateFile } = require("../../utils/rcloneUpload");

/**
 * Stream one of a user's verification documents.
 * Admins may read any user's documents (/api/admin/users/:id/verification-docs/:index);
 * users may read only their own (/api/auth/verification-docs/:index).
 */
const getVerificationDoc = async (req, res) => {
  try {
    const targetUserId = req.params.id ? Number(req.params.id) : req.user.id;
    const index = Number(req.params.index);

    if (targetUserId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied." });
    }
    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({ message: "Invalid document index." });
    }

    const result = await query("SELECT verification_docs FROM users WHERE id = $1", [targetUserId]);
    const docs = result.rows[0]?.verification_docs || [];
    if (index >= docs.length) {
      return res.status(404).json({ message: "Document not found." });
    }

    return streamPrivateFile(docs[index], res);
  } catch (err) {
    console.error("Get verification doc error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

module.exports = getVerificationDoc;
