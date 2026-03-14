/**
 * Legacy credential detector.
 *
 * This module is kept only for backward compatibility. The single source of
 * truth for secret/credential regexes now lives in `secretDetector.js`.
 * All callers should migrate to `detectSecrets`.
 */

const { detectSecrets } = require("./secretDetector");

function detectCredentials(text) {
  return detectSecrets(text);
}

module.exports = {
  detectCredentials,
};

