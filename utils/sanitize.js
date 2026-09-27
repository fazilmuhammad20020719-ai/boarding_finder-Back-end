/**
 * Sanitizes an HTML string to prevent XSS attacks.
 * Uses zero dependencies to avoid Node.js version conflicts on the server.
 * Escapes characters that could be interpreted as HTML markup.
 * 
 * @param {string} html 
 * @returns {string} - The sanitized HTML string
 */
function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') {
    return html;
  }
  // Basic HTML entity encoding
  return html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = { sanitizeHtml };
