// ─────────────────────────────────────────────────────────────
//  validators.js  –  Centralised input-validation helpers
// ─────────────────────────────────────────────────────────────

// ── Password ────────────────────────────────────────────────
// Min 8 chars, at least 1 uppercase, 1 lowercase, 1 digit, 1 special char
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~])/;

function validatePassword(password) {
  if (!password || typeof password !== "string") {
    return { valid: false, message: "Password is required." };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { valid: false, message: `Password must not exceed ${PASSWORD_MAX_LENGTH} characters.` };
  }
  if (!PASSWORD_REGEX.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.",
    };
  }
  return { valid: true };
}

// ── Email ───────────────────────────────────────────────────
// Standard RFC-5322-like regex (covers 99 %+ of real addresses)
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const EMAIL_MAX_LENGTH = 254; // RFC 5321

function validateEmail(email) {
  if (!email || typeof email !== "string") {
    return { valid: false, message: "Email is required." };
  }
  const trimmed = email.trim();
  if (trimmed.length > EMAIL_MAX_LENGTH) {
    return { valid: false, message: `Email must not exceed ${EMAIL_MAX_LENGTH} characters.` };
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, message: "Please enter a valid email address (e.g. user@example.com)." };
  }
  return { valid: true };
}

// ── Phone ───────────────────────────────────────────────────
// Accepts optional '+', digits, spaces, hyphens, parentheses — 7-15 digits total
const PHONE_REGEX = /^\+?[\d\s\-()]{7,20}$/;

function validatePhone(phone) {
  if (!phone || typeof phone !== "string") {
    // Phone is optional in some flows, but if provided must be valid
    return { valid: true };
  }
  const trimmed = phone.trim();
  if (trimmed.length === 0) {
    return { valid: true }; // empty is allowed (optional)
  }
  // Count actual digits
  const digitCount = (trimmed.match(/\d/g) || []).length;
  if (digitCount < 7 || digitCount > 15) {
    return { valid: false, message: "Phone number must contain between 7 and 15 digits." };
  }
  if (!PHONE_REGEX.test(trimmed)) {
    return { valid: false, message: "Please enter a valid phone number (e.g. +94 77 123 4567)." };
  }
  return { valid: true };
}

// ── Generic string length ───────────────────────────────────
function validateStringLength(value, fieldName, min = 1, max = 255) {
  if (!value || typeof value !== "string") {
    if (min > 0) {
      return { valid: false, message: `${fieldName} is required.` };
    }
    return { valid: true };
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    return { valid: false, message: `${fieldName} must be at least ${min} character(s).` };
  }
  if (trimmed.length > max) {
    return { valid: false, message: `${fieldName} must not exceed ${max} characters.` };
  }
  return { valid: true };
}

// ── Name ────────────────────────────────────────────────────
function validateName(name) {
  return validateStringLength(name, "Name", 2, 100);
}

// ── Listing fields ──────────────────────────────────────────
function validateTitle(title) {
  return validateStringLength(title, "Title", 3, 200);
}

function validateDescription(description) {
  return validateStringLength(description, "Description", 10, 5000);
}

// ── Review comment ──────────────────────────────────────────
function validateComment(comment) {
  return validateStringLength(comment, "Comment", 1, 2000);
}

// ── Forum ───────────────────────────────────────────────────
function validateForumTitle(title) {
  return validateStringLength(title, "Title", 3, 300);
}

function validateForumContent(content) {
  return validateStringLength(content, "Content", 1, 10000);
}

// ── Financial Inputs ────────────────────────────────────────
function validateFinancial(value, fieldName, min = 0.01, max = 1000000) {
  if (value === undefined || value === null) {
    return { valid: true }; // Let the database or required checks handle missing values
  }
  const num = Number(value);
  if (isNaN(num)) {
    return { valid: false, message: `${fieldName} must be a valid number.` };
  }
  if (num < min) {
    return { valid: false, message: `${fieldName} must be at least $${min}.` };
  }
  if (num > max) {
    return { valid: false, message: `${fieldName} cannot exceed $${max}.` };
  }
  return { valid: true };
}

// ── Role whitelist ──────────────────────────────────────────
const VALID_ROLES = ["student", "owner", "admin"];
function validateRole(role) {
  if (!role || !VALID_ROLES.includes(role)) {
    return { valid: false, message: "Role must be 'student', 'owner', or 'admin'." };
  }
  return { valid: true };
}

// ── Helper: run multiple validators and collect errors ──────
// validators: Array of { validator: fn, args: [...] }  OR  Array of { valid, message }
function collectErrors(results) {
  const errors = results.filter((r) => !r.valid).map((r) => r.message);
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}

module.exports = {
  validatePassword,
  validateEmail,
  validatePhone,
  validateName,
  validateStringLength,
  validateTitle,
  validateDescription,
  validateComment,
  validateForumTitle,
  validateForumContent,
  validateFinancial,
  validateRole,
  collectErrors,
  // Expose constants for frontend parity
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
};
