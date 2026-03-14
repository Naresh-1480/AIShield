/**
 * Python inference client.
 *
 * Calls the FastAPI ML service (/analyze) to get:
 * - PII entities
 * - contextual entities
 * - intent classification
 * - redactedText
 *
 * The service URL is taken from PYTHON_SERVICE_URL, defaulting to:
 *   http://127.0.0.1:8000/analyze
 *
 * On any failure, this client returns a safe fallback object so that
 * the Node backend never blocks on the Python layer.
 */

const http = require("http");
const https = require("https");

const DEFAULT_URL = "http://127.0.0.1:8000/analyze";

function getServiceUrl() {
  return process.env.PYTHON_SERVICE_URL || DEFAULT_URL;
}

function httpPostJson(urlString, body) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (err) {
      return reject(err);
    }

    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;

    const payload = JSON.stringify(body || {});

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + (url.search || ""),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 5000, // 5s safety timeout
    };

    const req = client.request(options, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data || "{}");
            resolve(parsed);
          } catch (err) {
            reject(err);
          }
        } else {
          reject(
            new Error(
              `Python service responded with status ${res.statusCode}`
            )
          );
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy(new Error("Python service request timed out"));
    });

    req.write(payload);
    req.end();
  });
}

function buildFallbackResponse(text) {
  return {
    pii: [],
    contextualEntities: [],
    intent: {
      label: "unknown",
      score: 0,
    },
    redactedText: text,
    modelMeta: {
      presidio: false,
      gliner: false,
      intentClassifier: false,
    },
  };
}

/**
 * Run Python ML inference for the given text and metadata.
 * Never throws: on any error, returns a safe fallback response.
 */
async function runPythonInference(text, metadata = {}) {
  const serviceUrl = getServiceUrl();

  try {
    const response = await httpPostJson(serviceUrl, {
      text: text || "",
      metadata: metadata || {},
    });

    // Basic shape validation with safe fallbacks.
    if (!response || typeof response !== "object") {
      return buildFallbackResponse(text);
    }

    return {
      pii: Array.isArray(response.pii) ? response.pii : [],
      contextualEntities: Array.isArray(response.contextualEntities)
        ? response.contextualEntities
        : [],
      intent:
        response.intent && typeof response.intent === "object"
          ? {
              label:
                typeof response.intent.label === "string"
                  ? response.intent.label
                  : "unknown",
              score: Number(response.intent.score) || 0,
            }
          : { label: "unknown", score: 0 },
      redactedText:
        typeof response.redactedText === "string"
          ? response.redactedText
          : text,
      modelMeta:
        response.modelMeta && typeof response.modelMeta === "object"
          ? {
              presidio: Boolean(response.modelMeta.presidio),
              gliner: Boolean(response.modelMeta.gliner),
              intentClassifier: Boolean(response.modelMeta.intentClassifier),
            }
          : {
              presidio: false,
              gliner: false,
              intentClassifier: false,
            },
    };
  } catch (err) {
    console.error("Python inference failed:", err.message || err);
    return buildFallbackResponse(text);
  }
}

module.exports = {
  runPythonInference,
};

