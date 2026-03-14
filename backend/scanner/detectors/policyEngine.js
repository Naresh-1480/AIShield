/**
 * Policy engine for combining:
 * - Python ML PII + contextual entities + intent
 * - existing regex-based secret detection
 * - code-risk detection
 *
 * into a final decision: ALLOW, REDACT, or BLOCK.
 */

// Types from secretDetector that indicate high-severity secrets.
const HIGH_SEVERITY_SECRET_TYPES = new Set([
  "PASSWORD",
  "PRIVATE_KEY",
  "API_KEY",
  "DATABASE_URL",
]);

// Intent labels from the Python service that indicate credential risk.
const CREDENTIAL_INTENTS = new Set(["credential_sharing"]);

// SSN-like pattern for extra safety checks
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;

/**
 * Compute whether any high-severity secrets are present.
 */
function hasHighSeveritySecret(secrets = [], intent = null) {
  if (Array.isArray(secrets)) {
    for (const s of secrets) {
      if (s && HIGH_SEVERITY_SECRET_TYPES.has(s.type)) {
        return true;
      }
    }
  }

  // If the ML intent classifier explicitly flags credential_sharing,
  // treat that as high-severity as well.
  if (intent && CREDENTIAL_INTENTS.has(intent.label)) {
    return true;
  }

  return false;
}

/**
 * Merge entities from different sources into a single list, tagging their origin.
 */
function mergeEntities({ pii, contextualEntities, secrets, code }) {
  const merged = [];

  if (Array.isArray(pii)) {
    for (const e of pii) {
      merged.push({
        source: "python_pii",
        type: e.entity_type || "PII",
        label: e.entity_type || "PII",
        text: e.text,
        start: e.start,
        end: e.end,
        score: e.score,
      });
    }
  }

  if (Array.isArray(contextualEntities)) {
    for (const e of contextualEntities) {
      merged.push({
        source: "python_context",
        type: e.label || "CONTEXT",
        label: e.label || "CONTEXT",
        text: e.text,
        start: e.start,
        end: e.end,
        score: e.score,
      });
    }
  }

  if (Array.isArray(secrets)) {
    for (const s of secrets) {
      merged.push({
        source: "secret_detector",
        type: s.type,
        label: s.type,
        value: s.value,
      });
    }
  }

  if (Array.isArray(code)) {
    for (const c of code) {
      merged.push({
        source: "code_detector",
        type: c.type || "CODE",
        label: c.type || "CODE",
        value: c.value,
      });
    }
  }

  return merged;
}

/**
 * Main policy function.
 *
 * Input payload:
 * {
 *   text,
 *   metadata,
 *   secrets,
 *   code,
 *   pii,
 *   contextualEntities,
 *   intent,
 *   redactedText
 * }
 *
 * Returns:
 * {
 *   action: "ALLOW" | "REDACT" | "BLOCK",
 *   riskScore: number,
 *   reasons: string[],
 *   entities: [],
 *   redactedText: string | null
 * }
 */
function applyPolicy(payload) {
  const text = payload?.text || "";
  const secrets = Array.isArray(payload?.secrets) ? payload.secrets : [];
  const code = Array.isArray(payload?.code) ? payload.code : [];
  const pii = Array.isArray(payload?.pii) ? payload.pii : [];
  const contextualEntities = Array.isArray(payload?.contextualEntities)
    ? payload.contextualEntities
    : [];
  const intent =
    payload?.intent && typeof payload.intent === "object"
      ? payload.intent
      : { label: "unknown", score: 0 };
  const mlRedactedText =
    typeof payload?.redactedText === "string" ? payload.redactedText : text;

  const reasons = [];

  const hasHighSecret = hasHighSeveritySecret(secrets, intent);
  const hasPII = pii.length > 0;
  const hasCode = code.length > 0;

  // SSN-specific nuance:
  // - If clearly labeled as SSN or matches SSN pattern and context indicates sharing,
  //   treat as BLOCK (very high risk).
  // - If the same pattern appears but context suggests "game id", treat as lower risk.
  let hasCriticalSSN = false;
  let hasContextualSSN = false;
  if (hasPII) {
    const lowerText = text.toLowerCase();
    for (const e of pii) {
      const entType = String(e.entity_type || "").toUpperCase();
      const entText = String(e.text || "");
      const looksLikeSSN =
        entType.includes("SSN") || SSN_PATTERN.test(entText);

      if (!looksLikeSSN) continue;

      const windowSize = 40;
      const start = Math.max(0, e.start - windowSize);
      const end = Math.min(text.length, e.end + windowSize);
      const context = text.slice(start, end).toLowerCase();

      const mentionsGameId = context.includes("game id");
      const mentionsSSN = context.includes("ssn") || context.includes("social security");

      if (mentionsGameId && !mentionsSSN) {
        hasContextualSSN = true;
      } else if (mentionsSSN || intent.label === "pii_sharing") {
        hasCriticalSSN = true;
      }
    }
  }

  if (hasHighSecret) {
    reasons.push("High-severity secret detected (API key/password/token/etc.)");
  }
  if (hasCriticalSSN) {
    reasons.push("Critical SSN-like identifier shared in sensitive context");
  } else if (hasContextualSSN) {
    reasons.push("SSN-like pattern but context suggests low risk (e.g. game id)");
  }
  if (hasPII) {
    reasons.push("PII detected and redaction available");
  }
  if (hasCode) {
    reasons.push("Code/config content detected");
  }
  if (!hasHighSecret && !hasPII && !hasCode) {
    reasons.push("No sensitive entities detected");
  }

  // Decide action and riskScore bands.
  let action = "ALLOW";
  let riskScore = 0.1; // default low

  // 1) Immediate BLOCK for high-severity secrets or critical SSN disclosure.
  if (hasHighSecret || hasCriticalSSN) {
    action = "BLOCK";
    const secretCount = secrets.length || (hasCriticalSSN ? 1 : 0);
    const factor = Math.min(secretCount, 5) / 5;
    riskScore = 0.9 + factor * 0.1; // 0.9–1.0
  }
  // 2) PII present but no critical SSN / secret -> REDACT.
  else if (hasPII) {
    action = "REDACT";
    const factor = Math.min(pii.length, 5) / 5;
    riskScore = 0.4 + factor * 0.35; // 0.4–0.75
  }
  // 3) Code/config without high secrets/PII -> moderate REDACT.
  else if (hasCode) {
    action = "REDACT";
    riskScore = 0.45;
  }
  // 4) Harmless / ambiguous content -> ALLOW.
  else {
    action = "ALLOW";
    riskScore = 0.1;
  }

  const entities = mergeEntities({ pii, contextualEntities, secrets, code });
  const redactedText = action === "REDACT" || action === "BLOCK" ? mlRedactedText : null;

  return {
    action,
    riskScore,
    reasons,
    entities,
    redactedText,
  };
}

module.exports = {
  applyPolicy,
};

