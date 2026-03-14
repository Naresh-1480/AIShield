/**
 * Secret detector.
 *
 * Single source of truth for high‑severity secrets and credentials:
 * - API keys (OpenAI, AWS, GitHub, Stripe, Slack, generic "api key = ...")
 * - Password‑style values
 * - Private keys
 * - Database URLs / connection strings
 * - JWTs
 *
 * NOTE:
 *  - This module is used directly by the main scanner pipeline.
 *  - Other legacy detectors (e.g. credentialDetector) should delegate to this
 *    module instead of re‑implementing their own logic.
 */

// OpenAI: sk- or sk-proj- prefix, then alphanumeric/underscore/hyphen (min 20 chars)
const OPENAI_KEY_REGEX = /sk-[a-zA-Z0-9_-]{20,}/g;
const AWS_KEY_REGEX = /AKIA[0-9A-Z]{16}/g;
const GITHUB_TOKEN_REGEX = /ghp_[A-Za-z0-9]{36}/g;
const JWT_REGEX =
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const PRIVATE_KEY_REGEX =
  /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g;
const DATABASE_URL_REGEX =
  /\b(?:mongodb|postgres|mysql):\/\/[^\s'"]+/g;

// Stripe: sk_live_, pk_live_, sk_test_, pk_test_ + 24+ chars
const STRIPE_KEY_REGEX = /(?:sk_live_|pk_live_|sk_test_|pk_test_)[a-zA-Z0-9]{24,}/g;
// Slack: xoxb-, xoxp-, xoxa-, xoxe-
const SLACK_TOKEN_REGEX = /xox[bpae]-[a-zA-Z0-9_-]{8,}/g;
// Generic "api key" / "apikey" / "api_key" followed by = or : and a long token (20+ chars)
const GENERIC_API_KEY_REGEX =
  /\b(?:api[_\s-]?key|apikey)\s*[:=]\s*["']?([a-zA-Z0-9_\-.]{20,})/gi;

// Password-like secrets, focusing on the secret token (group 2)
const PASSWORD_REGEX =
  /\b(password|passwd|pwd)\b[^A-Za-z0-9]{0,10}([^\s'"]{4,})/gi;

function buildEntities(type, matches) {
  const entities = [];
  for (const match of matches) {
    // For PASSWORD_REGEX we want group 2 (the actual secret token),
    // for others we take the entire match.
    const value = type === "PASSWORD" && match[2] ? match[2] : match[0];
    entities.push({
      type,
      value,
    });
  }
  return entities;
}

function detectSecrets(text) {
  if (!text || typeof text !== "string") {
    return [];
  }

  const entities = [];

  entities.push(
    ...buildEntities("API_KEY", text.matchAll(OPENAI_KEY_REGEX)),
    ...buildEntities("API_KEY", text.matchAll(AWS_KEY_REGEX)),
    ...buildEntities("API_KEY", text.matchAll(GITHUB_TOKEN_REGEX)),
    ...buildEntities("API_KEY", text.matchAll(JWT_REGEX)),
    ...buildEntities("API_KEY", text.matchAll(STRIPE_KEY_REGEX)),
    ...buildEntities("API_KEY", text.matchAll(SLACK_TOKEN_REGEX)),
    ...buildEntities("PRIVATE_KEY", text.matchAll(PRIVATE_KEY_REGEX)),
    ...buildEntities("DATABASE_URL", text.matchAll(DATABASE_URL_REGEX)),
    ...buildEntities("PASSWORD", text.matchAll(PASSWORD_REGEX)),
  );

  // Generic "api key = xxx" / "apikey: xxx" — use captured token (group 1) as value
  for (const match of text.matchAll(GENERIC_API_KEY_REGEX)) {
    if (match[1]) {
      entities.push({ type: "API_KEY", value: match[1] });
    }
  }

  if (entities.length > 0) {
    console.log("[scanner] Secret detector entities:", entities);
  }

  return entities;
}

module.exports = {
  detectSecrets,
};
