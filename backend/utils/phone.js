/**
 * Indian Mobile Number Utility (Backend)
 *
 * Rules:
 * 1. Mobile number must be exactly 10 digits after stripping optional +91 / 91 prefix.
 * 2. Must start with 6, 7, 8, or 9 (valid Indian mobile series).
 * 3. Explicitly rejects any number starting with 0, 1, 2, 3, 4, or 5.
 */

export const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

export const INDIAN_MOBILE_ERROR_MSG =
  "Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9";

/**
 * Normalizes an Indian mobile number input:
 * - Strips leading +91 or +
 * - Strips leading 91 if total digits is 12 (e.g. 919876543210)
 * - Removes non-digit characters like spaces, dashes, parentheses
 * - Returns clean digit string
 */
export function normalizeIndianMobile(rawInput) {
  if (rawInput === null || rawInput === undefined) return "";
  let s = String(rawInput).trim();
  if (!s) return "";

  // Strip +91 or +
  if (s.startsWith("+91")) {
    s = s.slice(3).trim();
  } else if (s.startsWith("+")) {
    s = s.slice(1).trim();
  }

  // Remove whitespace, dashes, parentheses, dots
  s = s.replace(/[\s\-().]/g, "");

  // If 12 digits starting with 91, strip 91 country code prefix
  if (s.length === 12 && s.startsWith("91")) {
    s = s.slice(2);
  }

  return s;
}

/**
 * Validates whether a mobile number matches Indian mobile rules.
 * Returns { isValid: boolean, normalized: string, error: string | null }
 */
export function validateIndianMobile(rawInput) {
  if (rawInput === null || rawInput === undefined || !String(rawInput).trim()) {
    return {
      isValid: false,
      normalized: "",
      error: INDIAN_MOBILE_ERROR_MSG,
    };
  }

  const normalized = normalizeIndianMobile(rawInput);

  // Check if non-digits remain
  if (/\D/.test(normalized)) {
    return {
      isValid: false,
      normalized,
      error: INDIAN_MOBILE_ERROR_MSG,
    };
  }

  // Reject any number starting with 0, 1, 2, 3, 4, 5
  if (/^[0-5]/.test(normalized)) {
    return {
      isValid: false,
      normalized,
      error: INDIAN_MOBILE_ERROR_MSG,
    };
  }

  // Must be exactly 10 digits starting with 6, 7, 8, or 9
  if (!INDIAN_MOBILE_REGEX.test(normalized)) {
    return {
      isValid: false,
      normalized,
      error: INDIAN_MOBILE_ERROR_MSG,
    };
  }

  return {
    isValid: true,
    normalized,
    error: null,
  };
}
