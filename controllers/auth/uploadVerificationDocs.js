const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { query } = require("../../db");
const { uploadFilesToDrive } = require("../../utils/rcloneUpload");

// Config from environment
const RCLONE_REMOTE = process.env.RCLONE_REMOTE || "gdrive:BoardingFinder/verifications";
const UPLOAD_TEMP_DIR = process.env.UPLOAD_TEMP_DIR || "/tmp/boarding-uploads";

// Ensure temp directory exists
if (!fs.existsSync(UPLOAD_TEMP_DIR)) {
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
}

// Configure Multer storage to temp dir
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${req.user.id}_${Date.now()}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

// File filter: only allow images and PDFs
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG, WebP images and PDF files are allowed."), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
}).array("documents", 5); // max 5 files

const uploadVerificationDocs = async (req, res) => {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "File size must be under 5MB." });
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({ message: "Maximum 5 files allowed." });
      }
      return res.status(400).json({ message: err.message });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }

    try {
      const userId = req.user.id;

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "Please upload at least one document." });
      }

      // Upload to Google Drive
      const fileUrls = uploadFilesToDrive(req.files, RCLONE_REMOTE, UPLOAD_TEMP_DIR);

      if (fileUrls.length === 0) {
        return res.status(500).json({
          message: "All file uploads failed. Is rclone configured on this server?",
        });
      }

      // Update user record with document URLs
      const result = await query(
        `UPDATE users
         SET verification_docs = $1,
             verification_status = 'pending',
             updated_at = NOW()
         WHERE id = $2
         RETURNING id, name, email, role, verification_status, verification_docs`,
        [fileUrls, userId]
      );

      return res.status(200).json({
        message: "Documents uploaded successfully! Your account is now pending admin review.",
        user: result.rows[0],
      });
    } catch (error) {
      console.error("Upload verification docs error:", error.message);
      return res.status(500).json({ message: "Server error. Please try again." });
    }
  });
};

module.exports = uploadVerificationDocs;
