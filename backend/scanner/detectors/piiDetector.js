/**
 * PII Detector — Enterprise-focused regex detection.
 *
 * Only tracks data that is genuinely risky in an organizational context:
 *  - Employee / client email addresses
 *  - Phone numbers (direct-dial contacts)
 *  - SSN (HR / payroll scenarios — US-centric but relevant)
 *
 * Intentionally REMOVED (too noisy / not org-relevant):
 *  - Credit card numbers  → not in enterprise prompts
 *  - Aadhaar             → too locale-specific and rare in corp use
 *  - Passport numbers    → passport scanners flag too many code identifiers
 *  - Date of birth       → format too ambiguous; version strings match constantly
 *  - IP addresses        → handled by secretDetector (internal infra context)
 *
 * Also exports redactPII() which replaces detected spans with [TYPE_REDACTED].
 */

const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const PHONE_REGEX =
  /\b(?:\+?1[\s-]?)?(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/g;

// SSN: 123-45-6789 (US Social Security Number)
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;

function buildEntities(type, regex, text) {
  const entities = [];
  let match;
  regex.lastIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    entities.push({
      type,
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return entities;
}

function detectPII(text) {
  if (!text || typeof text !== "string") {
    return [];
  }

  const entities = [
    ...buildEntities("EMAIL", EMAIL_REGEX, text),
    ...buildEntities("PHONE", PHONE_REGEX, text),
    ...buildEntities("SSN", SSN_REGEX, text),
  ];

  if (entities.length > 0) {
    console.log("[scanner] Local PII detector entities:", entities);
  }

  return entities;
}

/**
 * Redact PII in text by replacing matched spans with [TYPE_REDACTED].
 * Processes entities from end to start to preserve indices.
 */
function redactPII(text, entities) {
  if (!entities || entities.length === 0) return text;

  // Sort by start position descending (replace from end to preserve indices)
  const sorted = [...entities].sort((a, b) => b.start - a.start);
  let result = text;

  for (const e of sorted) {
    const replacement = `[${e.type}_REDACTED]`;
    result = result.slice(0, e.start) + replacement + result.slice(e.end);
  }

  return result;
}

module.exports = {
  detectPII,
  redactPII,
};
