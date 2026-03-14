const { detectCode } = require("./scanner/detectors/codeDetector");
const { detectSecrets } = require("./scanner/detectors/secretDetector");
const { runPythonInference } = require("./scanner/detectors/pythonInferenceClient");
const { applyPolicy } = require("./scanner/detectors/policyEngine");

/**
 * Orchestrate all detectors and the Python ML service for a single prompt.
 *
 * This is the main entry point used by the backend server.
 */
async function scanPrompt(text, metadata = {}) {
  const safeText = typeof text === "string" ? text : "";
  const safeMetadata = metadata && typeof metadata === "object" ? metadata : {};

  // 1) Run local regex / structural detectors.
  const secrets = detectSecrets(safeText);
  const code = detectCode(safeText);

  console.log("[scanner] Secret detector output:", secrets);
  console.log("[scanner] Code detector output:", code);

  // 2) Call Python service for PII / intent / contextual entities.
  const mlResult = await runPythonInference(safeText, safeMetadata);
  console.log("[scanner] Python ML output:", mlResult);

  const payload = {
    text: safeText,
    metadata: safeMetadata,
    secrets,
    code: Array.isArray(code) ? code : [],
    pii: Array.isArray(mlResult.pii) ? mlResult.pii : [],
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
  console.log("[scanner] Final policy result:", policyResult);

  return policyResult;
}

module.exports = {
  scanPrompt,
};

