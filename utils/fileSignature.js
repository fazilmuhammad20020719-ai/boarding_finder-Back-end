const fs = require("fs");

// Magic-byte signatures for the only file types we accept.
// The extension is derived from the detected type, never from the client's filename.
const SIGNATURES = [
  { mime: "image/jpeg", ext: ".jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: ".png", test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", ext: ".webp", test: (b) => b.slice(0, 4).toString("ascii") === "RIFF" && b.slice(8, 12).toString("ascii") === "WEBP" },
  { mime: "application/pdf", ext: ".pdf", test: (b) => b.slice(0, 5).toString("ascii") === "%PDF-" },
];

/**
 * Read the first bytes of a file and return { mime, ext } if it matches an allowed signature.
 * @param {string} filePath
 * @param {string[]} allowedMimes
 * @returns {{mime: string, ext: string} | null}
 */
function detectFileType(filePath, allowedMimes) {
  const fd = fs.openSync(filePath, "r");
  const header = Buffer.alloc(12);
  try {
    fs.readSync(fd, header, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  const match = SIGNATURES.find((sig) => sig.test(header));
  if (!match || !allowedMimes.includes(match.mime)) return null;
  return { mime: match.mime, ext: match.ext };
}

const mimeFromExt = (filename) => {
  const lower = filename.toLowerCase();
  const match = SIGNATURES.find((sig) => lower.endsWith(sig.ext) || (sig.ext === ".jpg" && lower.endsWith(".jpeg")));
  return match ? match.mime : "application/octet-stream";
};

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];
const DOCUMENT_MIMES = [...IMAGE_MIMES, "application/pdf"];

module.exports = { detectFileType, mimeFromExt, IMAGE_MIMES, DOCUMENT_MIMES };
