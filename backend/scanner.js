const { detectCode } = require("./scanner/detectors/codeDetector");
const { detectSecrets } = require("./scanner/detectors/secretDetector");
const { detectPII, redactPII } = require("./scanner/detectors/piiDetector");
const { runPythonInference } = require("./scanner/detectors/pythonInferenceClient");
const { applyPolicy } = require("./scanner/detectors/policyEngine");

/**
 * Orchestrate all detectors and the Python ML service for a single prompt.
 *
 * Pipeline:
 *  1. Run LOCAL regex detectors (always available, instant):
 *     - secretDetector  → API keys, passwords, internal infra
 *     - codeDetector    → code pastes, env config, confidential markers
 *     - piiDetector     → emails, phones, SSN, credit cards (fallback)
 *
 *  2. Call Python ML service (best-effort, with fallback):
 *     - Presidio PII    → ML-powered PII detection + anonymization
 *     - GLiNER          → contextual entities (game_id, project_name, etc.)
 *     - Intent          → heuristic intent classification
 *
 *  3. Merge results and pass to the policy engine for final decision.
 *
 * The local PII detector serves as a safety net: if the Python ML service
 * is down or slow, the pipeline still catches emails, SSNs, etc.
 */
async function scanPrompt(text, metadata = {}) {
  const safeText = typeof text === "string" ? text : "";
  const safeMetadata = metadata && typeof metadata === "object" ? metadata : {};

  // 1) Run local regex detectors (instant, always available)
  const secrets = detectSecrets(safeText);
  const code = detectCode(safeText);
  const localPII = detectPII(safeText);
  const localRedactedText = localPII.length > 0 ? redactPII(safeText, localPII) : null;

  console.log("[scanner] Secret/infra detector:", secrets.length, "entities");
  console.log("[scanner] Code detector:", code.length, "entities");
  console.log("[scanner] Local PII detector:", localPII.length, "entities");

  // 2) Call Python ML service (best-effort)
  const mlResult = await runPythonInference(safeText, safeMetadata);

  const mlWorked = mlResult.pii.length > 0 || (mlResult.intent && mlResult.intent.label !== "unknown");
  console.log("[scanner] Python ML service:", mlWorked ? "responded with data" : "no data / fallback");

  // 3) Build policy payload with both ML and local results
  const payload = {
    text: safeText,
    metadata: safeMetadata,
    secrets,
    code: Array.isArray(code) ? code : [],

    // ML PII (from Presidio)
    pii: Array.isArray(mlResult.pii) ? mlResult.pii : [],

    // Local PII (regex fallback — policy engine merges + deduplicates)
    localPII,
    localRedactedText,

    contextualEntities: Array.isArray(mlResult.contextualEntities)
      ? mlResult.contextualEntities
      : [],
    intent:
      mlResult.intent && typeof mlResult.intent === "object"
        ? mlResult.intent
        : { label: "unknown", score: 0 },
    redactedText:
      typeof mlResult.redactedText === "string" ? mlResult.redactedText : safeText,
  };

  const policyResult = applyPolicy(payload);
  console.log("[scanner] Final decision:", policyResult.action, "| risk:", policyResult.riskScore);

  return policyResult;
}

module.exports = {
  scanPrompt,
};
