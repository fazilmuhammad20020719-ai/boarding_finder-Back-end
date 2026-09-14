const fs = require("fs");
const { uploadFilesToDrive } = require("../../utils/rcloneUpload");

// Config from environment
const RCLONE_REMOTE = process.env.RCLONE_REMOTE || "gdrive:BoardingFinder/listings";
const UPLOAD_TEMP_DIR = process.env.UPLOAD_TEMP_DIR || "/tmp/boarding-uploads";

/**
 * Upload listing photos to Google Drive via rclone.
 * Expects multer files on req.files.
 */
const uploadPhotos = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files provided." });
    }

    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Only owners can upload photos." });
    }

    const successfulUrls = uploadFilesToDrive(req.files, RCLONE_REMOTE, UPLOAD_TEMP_DIR);

    if (successfulUrls.length === 0) {
      return res.status(500).json({
        message: "All file uploads failed. Is rclone configured on this server?",
      });
    }

    return res.status(200).json({
      message: `${successfulUrls.length} file(s) uploaded successfully`,
      urls: successfulUrls,
    });
  } catch (err) {
    console.error("Error uploading photos:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { uploadPhotos };
