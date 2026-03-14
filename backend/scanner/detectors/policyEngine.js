/**
 * Policy engine — single decision point for the scanner pipeline.
 *
 * Enterprise threat model (Shadow AI / org data loss prevention):
 *
 *  BLOCK  (hard block, no send option):
 *   - API keys, passwords, tokens, private keys, DB credentials
 *   - Confidential business markers ("CONFIDENTIAL", "PROPRIETARY", etc.)
 *   - SSN in an HR/employee context + dangerous intent + multiple PII
 *
 *  REDACT (red warning modal — user can redact & send, or cancel):
 *   - Multiple employee/client PII items (email, phone, SSN)
 *   - Dangerous intent combined with any PII
 *
 *  WARN   (yellow toast — informs user, prompt still auto-sends):
 *   - Single email or phone detected in an otherwise clean prompt
 *   - Internal infrastructure details (URLs, AWS ARNs, S3, hostnames, containers)
 *   - .env config blocks, proprietary source code pastes, DB schema
 *
 *  ALLOW  (silent green flash — prompt is safe):
 *   - General technical questions, coding help, creative requests
 *
 * Consumer-focused entities intentionally EXCLUDED:
 *  Credit card, Aadhaar, passport, DOB, IP addresses, game IDs.
 */

// ─── Entity type classifications ──────────────────────────────

// Critical secrets → BLOCK
const CRITICAL_SECRET_TYPES = new Set([
  "API_KEY",
  "PRIVATE_KEY",
  "PASSWORD",
  "DATABASE_URL",
]);

// Enterprise PII → REDACT (email, phone, SSN when context is unclear)
const SENSITIVE_PII_TYPES = new Set([
  "EMAIL",
  "EMAIL_ADDRESS",    // Presidio label
  "PHONE",
  "PHONE_NUMBER",     // Presidio label
  "SSN",
  "US_SSN",           // Presidio label
  "PERSON",           // Presidio — employee/contact names
  "LOCATION",         // Presidio — office/client address context
]);

// Internal infrastructure → REDACT
const INFRA_TYPES = new Set([
  "INTERNAL_URL",
  "AWS_ARN",
  "S3_BUCKET",
  "INTERNAL_HOSTNAME",
  "CONTAINER_IMAGE",
]);

// Code/config leaks
const CODE_TYPES = new Set([
  "CODE_BLOCK",
  "ENV_CONFIG",
  "CONFIDENTIAL_MARKER",
  "DATABASE_SCHEMA",
  "SOURCE_CODE",
]);

// Intent labels that escalate risk
const DANGEROUS_INTENTS = new Set([
  "credential_sharing",
  "pii_sharing",
  "internal_data_exposure",
]);

// SSN pattern for nuanced context check
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;

// ─── Helpers ──────────────────────────────────────────────────

function hasCriticalSecret(secrets = [], intent = null) {
  if (Array.isArray(secrets)) {
    for (const s of secrets) {
      if (s && CRITICAL_SECRET_TYPES.has(s.type)) return true;
    }
  }
  if (intent && intent.label === "credential_sharing" && intent.score >= 0.7) {
    return true;
  }
  return false;
}

function hasInfraExposure(secrets = []) {
  if (!Array.isArray(secrets)) return false;
  return secrets.some((s) => INFRA_TYPES.has(s.type));
}

function countSensitivePII(pii = []) {
  if (!Array.isArray(pii)) return { count: 0, types: new Set() };
  const types = new Set();
  let count = 0;
  for (const e of pii) {
    const t = (e.entity_type || e.type || "").toUpperCase();
    if (SENSITIVE_PII_TYPES.has(t) || SENSITIVE_PII_TYPES.has(e.entity_type || e.type || "")) {
      types.add(t);
      count++;
    }
  }
  return { count, types };
}

function hasCodeLeak(code = []) {
  if (!Array.isArray(code)) return { hasBlock: false, hasEnv: false, hasConfidential: false, hasSchema: false };
  return {
    hasBlock: code.some((c) => c.type === "CODE_BLOCK"),
    hasEnv: code.some((c) => c.type === "ENV_CONFIG"),
    hasConfidential: code.some((c) => c.type === "CONFIDENTIAL_MARKER"),
    hasSchema: code.some((c) => c.type === "DATABASE_SCHEMA"),
  };
}

/**
 * Merge entities from different sources into a single list.
 */
function mergeEntities({ pii, contextualEntities, secrets, code, localPII }) {
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

  if (Array.isArray(localPII)) {
    for (const e of localPII) {
      const isDuplicate = merged.some(
        (m) =>
          m.source === "python_pii" &&
          Math.abs((m.start || 0) - (e.start || 0)) < 3 &&
          Math.abs((m.end || 0) - (e.end || 0)) < 3,
      );
      if (!isDuplicate) {
        merged.push({
          source: "local_pii",
          type: e.type,
          label: e.type,
          text: e.value,
          start: e.start,
          end: e.end,
          score: 0.8,
        });
      }
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

// ─── Main policy function ─────────────────────────────────────

function applyPolicy(payload) {
  const text = payload?.text || "";
  const secrets = Array.isArray(payload?.secrets) ? payload.secrets : [];
  const code = Array.isArray(payload?.code) ? payload.code : [];
  const pii = Array.isArray(payload?.pii) ? payload.pii : [];
  const localPII = Array.isArray(payload?.localPII) ? payload.localPII : [];
  const contextualEntities = Array.isArray(payload?.contextualEntities)
    ? payload.contextualEntities
    : [];
  const intent =
    payload?.intent && typeof payload.intent === "object"
      ? payload.intent
      : { label: "unknown", score: 0 };
  const mlRedactedText =
    typeof payload?.redactedText === "string" ? payload.redactedText : text;
  const localRedactedText =
    typeof payload?.localRedactedText === "string" ? payload.localRedactedText : null;

  const reasons = [];

  // ── Analyze risk dimensions ──

  const isCriticalSecret = hasCriticalSecret(secrets, intent);
  const infraExposed = hasInfraExposure(secrets);
  const codeLeak = hasCodeLeak(code);
  const isDangerousIntent = DANGEROUS_INTENTS.has(intent.label) && intent.score >= 0.7;

  // SSN context check — only flag SSN as critical in genuine HR context.
  // If there is no SSN-related keyword and intent is benign, treat as non-critical.
  let hasCriticalSSN = false;
  const lowerText = text.toLowerCase();

  const mlPIIMapped = pii.map((e) => ({ entity_type: e.entity_type, text: e.text, start: e.start || 0, end: e.end || 0 }));
  const localPIIMapped = localPII.map((e) => ({ entity_type: e.type, text: e.value, start: e.start || 0, end: e.end || 0 }));

  // Deduplicate: keep local PII only if it doesn't overlap an ML PII span.
  const dedupedLocalPII = localPIIMapped.filter((local) =>
    !mlPIIMapped.some(
      (ml) =>
        Math.abs(ml.start - local.start) < 5 &&
        Math.abs(ml.end - local.end) < 5
    )
  );

  const allPII = [...mlPIIMapped, ...dedupedLocalPII];

  for (const e of allPII) {
    const entType = String(e.entity_type || "").toUpperCase();
    const entText = String(e.text || "");
    const looksLikeSSN = entType.includes("SSN") || SSN_PATTERN.test(entText);
    if (!looksLikeSSN) continue;

    // Only critical if there's explicit SSN context or intent indicates PII sharing
    if (
      lowerText.includes("ssn") ||
      lowerText.includes("social security") ||
      intent.label === "pii_sharing"
    ) {
      hasCriticalSSN = true;
    }
    // Otherwise: SSN-format numbers without context (e.g. order IDs, game IDs) are ignored.
  }

  const { count: piiCount, types: piiTypes } = countSensitivePII(allPII);

  // ── Build reasons ──

  if (isCriticalSecret) {
    reasons.push("Critical secret detected (API key, password, token, or private key)");
  }
  if (hasCriticalSSN) {
    reasons.push("SSN detected in sensitive HR/payroll context");
  }
  if (infraExposed) {
    reasons.push("Internal infrastructure details detected (internal URLs, cloud resources, hostnames)");
  }
  if (piiCount > 0) {
    reasons.push(`Employee/client PII detected: ${[...piiTypes].join(", ")} (${piiCount} item${piiCount > 1 ? "s" : ""})`);
  }
  if (codeLeak.hasConfidential) {
    reasons.push("Confidential/proprietary content marker found");
  }
  if (codeLeak.hasEnv) {
    reasons.push("Environment configuration with secrets detected");
  }
  if (codeLeak.hasBlock) {
    reasons.push("Proprietary source code paste detected");
  }
  if (codeLeak.hasSchema) {
    reasons.push("Database schema definition detected");
  }
  if (isDangerousIntent && !isCriticalSecret) {
    reasons.push(`Risky intent detected: ${intent.label}`);
  }

  if (reasons.length === 0) {
    reasons.push("No sensitive data detected — prompt is safe");
  }

  // ── Decide action and risk score ──

  let action = "ALLOW";
  let riskScore = 0.05;

  // Priority 1: BLOCK — critical secrets (API keys, passwords, tokens, private keys, DB creds)
  if (isCriticalSecret) {
    action = "BLOCK";
    riskScore = 0.95;
  }
  // Priority 2: BLOCK — confidential markers OR SSN in HR context + multiple PII
  else if (codeLeak.hasConfidential || (hasCriticalSSN && piiCount > 1)) {
    action = "BLOCK";
    riskScore = 0.9;
  }
  // Priority 3: REDACT — dangerous intent with PII, or multiple PII items (>1)
  else if ((isDangerousIntent && piiCount > 0) || piiCount > 1) {
    action = "REDACT";
    const factor = Math.min(piiCount, 5) / 5;
    riskScore = 0.55 + factor * 0.25; // 0.55–0.80
  }
  // Priority 4: REDACT — single SSN in HR context (still serious)
  else if (hasCriticalSSN) {
    action = "REDACT";
    riskScore = 0.75;
  }
  // Priority 5: WARN — single PII item (one email / one phone)
  else if (piiCount === 1) {
    action = "WARN";
    riskScore = 0.35;
  }
  // Priority 6: WARN — internal infrastructure or env config or DB schema
  else if (infraExposed || codeLeak.hasEnv || codeLeak.hasSchema) {
    action = "WARN";
    riskScore = 0.40;
  }
  // Priority 7: WARN — proprietary code paste
  else if (codeLeak.hasBlock) {
    action = "WARN";
    riskScore = 0.30;
  }
  // Priority 8: ALLOW — clean prompt
  else {
    action = "ALLOW";
    riskScore = 0.05;
  }

  // ── Build entity list and redacted text ──

  const entities = mergeEntities({ pii, contextualEntities, secrets, code, localPII });

  let redactedText = null;
  if (action === "REDACT" || action === "BLOCK") {
    if (pii.length > 0 && mlRedactedText !== text) {
      redactedText = mlRedactedText;
    } else if (localRedactedText) {
      redactedText = localRedactedText;
    } else {
      redactedText = text;
    }
  }

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
