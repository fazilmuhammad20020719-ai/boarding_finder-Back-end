const { execFileSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const sharp = require("sharp");
const { detectFileType, mimeFromExt, IMAGE_MIMES } = require("./fileSignature");

// Listing photos are resized and re-encoded before upload: smaller files load
// faster, and re-encoding strips EXIF metadata (including GPS location).
const MAX_PHOTO_DIMENSION = 1600;
const PHOTO_QUALITY = 80;

const compressPhoto = async (inputPath, outputPath) => {
  await sharp(inputPath)
    .rotate() // honour EXIF orientation before metadata is dropped
    .resize({ width: MAX_PHOTO_DIMENSION, height: MAX_PHOTO_DIMENSION, fit: "inside", withoutEnlargement: true })
    .webp({ quality: PHOTO_QUALITY })
    .toFile(outputPath);
};

// Private documents that could not be pushed to cloud storage are kept here.
// This directory is NOT served statically — files are only reachable through
// authenticated endpoints (see streamPrivateFile).
const PRIVATE_UPLOAD_DIR = path.join(__dirname, "..", "uploads");

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
 * Validate each file's magic bytes, then move it into a fresh batch directory
 * under a UUID name with an extension derived from the detected type.
 * Throws if any file does not match an allowed signature.
 */
function prepareBatch(files, tempDir, allowedMimes) {
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const detected = files.map((file) => detectFileType(file.path, allowedMimes));
  if (detected.some((d) => d === null)) {
    files.forEach((file) => fs.rmSync(file.path, { force: true }));
    const err = new Error("One or more files are not a valid allowed file type.");
    err.status = 400;
    throw err;
  }

  const batchId = crypto.randomUUID();
  const batchDir = path.join(tempDir, batchId);
  fs.mkdirSync(batchDir, { recursive: true });

  const prepared = files.map((file, i) => {
    const uniqueName = `${crypto.randomUUID()}${detected[i].ext}`;
    const tempFilePath = path.join(batchDir, uniqueName);
    fs.renameSync(file.path, tempFilePath);
    return { uniqueName, tempFilePath };
  });

  return { batchId, batchDir, prepared };
}

/**
 * Upload public files (listing photos) to Google Drive via rclone and return
 * public direct-embed URLs.
 * @param {Array} files - Array of multer files (req.files).
 * @param {String} remoteFolder - The rclone remote path (e.g. "gdrive:BoardingFinder/listings")
 * @param {String} tempDir - The base temp directory for uploads.
 * @returns {Promise<Array<String>>} Direct embed URLs for the successfully uploaded files.
 */
const uploadFilesToDrive = async (files, remoteFolder, tempDir, allowedMimes = IMAGE_MIMES) => {
  const { batchId, batchDir, prepared } = prepareBatch(files, tempDir, allowedMimes);
  const uploadedUrls = [];

  for (const file of prepared) {
    let { uniqueName, tempFilePath } = file;
    try {
      const webpName = uniqueName.replace(/\.[^.]+$/, ".webp");
      const webpPath = path.join(batchDir, webpName);
      await compressPhoto(tempFilePath, webpPath);
      fs.rmSync(tempFilePath, { force: true });
      uniqueName = webpName;
      tempFilePath = webpPath;
    } catch (compressErr) {
      // Fall back to the validated original if the image can't be processed
      console.warn(`Image compression failed for ${uniqueName}, uploading original:`, compressErr.message);
    }

    try {
      const remotePath = `${remoteFolder}/${batchId}`;
      execFileSync("rclone", ["copy", tempFilePath, remotePath], { timeout: 60000, stdio: "pipe" });

      // Get public shareable link
      const linkOutput = execFileSync("rclone", ["link", `${remotePath}/${uniqueName}`], {
        timeout: 30000,
        stdio: "pipe",
      }).toString().trim();

      uploadedUrls.push(toDirectImageUrl(linkOutput));
    } catch (rcloneErr) {
      console.error(`rclone error for file ${uniqueName}:`, rcloneErr.message);
    }
  }

  fs.rmSync(batchDir, { recursive: true, force: true });
  return uploadedUrls;
};

/**
 * Store private files (identity documents). Files are copied to the rclone
 * remote WITHOUT creating a public share link. If rclone is unavailable the
 * file is kept in the private local upload directory instead.
 * @returns {Array<String>} Storage references: "rclone:<remote path>" or "uploads/<subdir>/<file>"
 */
const storePrivateFiles = (files, remoteFolder, tempDir, allowedMimes, localSubdir) => {
  const { batchId, batchDir, prepared } = prepareBatch(files, tempDir, allowedMimes);
  const refs = [];

  for (const { uniqueName, tempFilePath } of prepared) {
    const remotePath = `${remoteFolder}/${batchId}`;
    try {
      execFileSync("rclone", ["copy", tempFilePath, remotePath], { timeout: 60000, stdio: "pipe" });
      refs.push(`rclone:${remotePath}/${uniqueName}`);
    } catch (rcloneErr) {
      console.error(`rclone error for private file ${uniqueName}, storing locally:`, rcloneErr.message);
      const localDir = path.join(PRIVATE_UPLOAD_DIR, localSubdir);
      fs.mkdirSync(localDir, { recursive: true });
      fs.copyFileSync(tempFilePath, path.join(localDir, uniqueName));
      refs.push(`uploads/${localSubdir}/${uniqueName}`);
    }
  }

  fs.rmSync(batchDir, { recursive: true, force: true });
  return refs;
};

/**
 * Stream a privately stored file to an Express response.
 * Supports rclone references, local private uploads, and legacy public Drive URLs.
 */
const streamPrivateFile = (ref, res) => {
  if (ref.startsWith("rclone:")) {
    const remotePath = ref.slice("rclone:".length);
    res.setHeader("Content-Type", mimeFromExt(remotePath));
    res.setHeader("Cache-Control", "private, no-store");
    const child = spawn("rclone", ["cat", remotePath]);
    child.stdout.pipe(res);
    child.on("error", () => {
      if (!res.headersSent) res.status(500).json({ message: "Failed to read document." });
    });
    child.on("close", (code) => {
      if (code !== 0 && !res.headersSent) res.status(404).json({ message: "Document not found." });
      else if (code !== 0) res.end();
    });
    return;
  }

  if (/^https?:\/\//.test(ref)) {
    // Legacy documents stored with a public Drive link: proxy server-side so the
    // browser never needs the share URL. Only Drive hosts are allowed (no SSRF).
    const fileId = ref.match(/(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]+)/)?.[1];
    if (!fileId || new URL(ref).hostname !== "drive.google.com") {
      return res.status(404).json({ message: "Document not found." });
    }
    return fetch(`https://drive.google.com/uc?id=${fileId}&export=download`)
      .then(async (upstream) => {
        if (!upstream.ok) return res.status(404).json({ message: "Document not found." });
        res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
        res.setHeader("Cache-Control", "private, no-store");
        res.send(Buffer.from(await upstream.arrayBuffer()));
      })
      .catch(() => res.status(502).json({ message: "Failed to fetch document." }));
  }

  // Local private upload (legacy "uploads/verification/..." or fallback storage).
  const relative = ref.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^uploads\//, "");
  const resolved = path.resolve(PRIVATE_UPLOAD_DIR, relative);
  if (!resolved.startsWith(PRIVATE_UPLOAD_DIR + path.sep) || !fs.existsSync(resolved)) {
    return res.status(404).json({ message: "Document not found." });
  }
  res.setHeader("Cache-Control", "private, no-store");
  return res.sendFile(resolved);
};

module.exports = { uploadFilesToDrive, storePrivateFiles, streamPrivateFile, toDirectImageUrl };
