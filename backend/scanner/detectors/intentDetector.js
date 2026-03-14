/**
 * Intent detector — no keyword-based blocking.
 * Reserved for future contextual/AI-based intent detection.
 */

function detectIntent(text) {
  if (!text || typeof text !== "string") {
    return [];
  }

  // No keyword matching. Returns neutral result (no entities).
  return [];
}

module.exports = {
  detectIntent,
};
