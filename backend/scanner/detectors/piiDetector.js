const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_REGEX =
  /\b(?:\+?1[\s-]?)?(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/g;

// Allow common SSN formats:
// - Strict: 123-45-6789
// - More permissive: 123-456789 (to catch user-entered variants)
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b|\b\d{3}-\d{6}\b/g;

// Credit card:
// Match typical 16-digit cards in groups of 4 with optional space/dash separators.
// This avoids misclassifying 12-digit Aadhaar numbers as credit cards.
const CREDIT_CARD_REGEX =
  /\b(?:\d{4}[\s-]?){3}\d{4}\b/g;
const IP_ADDRESS_REGEX =
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const NAME_REGEX = /\b([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})\b/g;

function buildEntities(type, matches) {
  const entities = [];
  for (const match of matches) {
    entities.push({
      type,
      value: match[0],
    });
  }
  return entities;
}

function detectPII(text) {
  if (!text || typeof text !== "string") {
    return [];
  }

  const entities = [];

  entities.push(
    ...buildEntities("EMAIL", text.matchAll(EMAIL_REGEX)),
    ...buildEntities("PHONE", text.matchAll(PHONE_REGEX)),
    ...buildEntities("SSN", text.matchAll(SSN_REGEX)),
    ...buildEntities("CREDIT_CARD", text.matchAll(CREDIT_CARD_REGEX)),
    ...buildEntities("IP_ADDRESS", text.matchAll(IP_ADDRESS_REGEX)),
    ...buildEntities("NAME", text.matchAll(NAME_REGEX))
  );

  return entities;
}

module.exports = {
  detectPII,
};

