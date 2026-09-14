const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

/**
 * Convert a Google Drive sharing link to a direct-embed URL.
 * Input:  https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 * Output: https://drive.google.com/uc?id=FILE_ID&export=view
 */
function toDirectImageUrl(shareLink) {
  // Handle /d/FILE_ID/view format
  let match = shareLink.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/uc?id=${match[1]}&export=view`;
  }
  // Handle /open?id=FILE_ID format (rclone default)
  match = shareLink.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/uc?id=${match[1]}&export=view`;
  }
  // If we can't parse it, return as-is
  return shareLink;
}

/**
 * Upload files to Google Drive via rclone.
 * @param {Array} files - Array of multer files (req.files).
 * @param {String} remoteFolder - The rclone remote path (e.g. "gdrive:BoardingFinder/listings")
 * @param {String} tempDir - The base temp directory for uploads.
 * @returns {Array<String>} Array of direct embed URLs for the successfully uploaded files.
 */
const uploadFilesToDrive = (files, remoteFolder, tempDir) => {
  const uuidv4 = () => crypto.randomUUID();
  
  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create a unique subfolder for this batch upload
  const batchId = uuidv4();
  const batchDir = path.join(tempDir, batchId);
  fs.mkdirSync(batchDir, { recursive: true });

  const uploadedUrls = [];

  for (const file of files) {
    // Generate unique filename preserving the original extension
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    const tempFilePath = path.join(batchDir, uniqueName);

    // Move file from multer's temp location to our batch directory
    fs.renameSync(file.path, tempFilePath);

    try {
      // Upload to Google Drive via rclone
      const remotePath = `${remoteFolder}/${batchId}`;
      execSync(`rclone copy "${tempFilePath}" "${remotePath}"`, {
        timeout: 60000, // 60 second timeout per file
        stdio: "pipe",
      });

      // Get public shareable link
      const linkOutput = execSync(
        `rclone link "${remotePath}/${uniqueName}"`,
        { timeout: 30000, stdio: "pipe" }
      ).toString().trim();

      // Convert sharing link to direct embed URL for <img> tags
      const directUrl = toDirectImageUrl(linkOutput);
      uploadedUrls.push(directUrl);
    } catch (rcloneErr) {
      console.error(`rclone error for file ${uniqueName}:`, rcloneErr.message);
      // Continue with other files even if one fails
      uploadedUrls.push(null);
    }
  }

  // Clean up the entire batch temp directory
  try {
    fs.rmSync(batchDir, { recursive: true, force: true });
  } catch (cleanupErr) {
    console.warn("Temp cleanup warning:", cleanupErr.message);
  }

  // Filter out any nulls (failed uploads)
  return uploadedUrls.filter((url) => url !== null);
};

module.exports = { uploadFilesToDrive, toDirectImageUrl };
