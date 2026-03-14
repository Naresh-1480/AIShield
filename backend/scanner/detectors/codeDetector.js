/**
 * Code / config leak detector.
 *
 * Purpose:
 *  - Detect likely source‑code pastes.
 *  - Detect .env‑style configuration with secrets.
 *  - Detect internal config / auth snippets.
 *
 * This detector only reports *what* it sees. It never decides ALLOW/REDACT/BLOCK.
 * The policy engine is the single place that makes final decisions.
 */

const ENV_LINE_REGEX = /^[A-Z0-9_]{3,32}\s*=\s*.+$/gm;
const CODE_CLUE_REGEXES = [
  /function\s+[a-zA-Z0-9_]+\s*\(/,
  /\bclass\s+[A-Z][A-Za-z0-9_]*\s*\{/,
  /\bdef\s+[a-zA-Z0-9_]+\s*\(/,
  /import\s+[\w*{}\s,]+from\s+['"].+['"]/,
  /#include\s+<.+>/,
  /console\.log\(/,
  /System\.out\.println\(/,
];

function detectCode(text) {
  if (!text || typeof text !== "string") {
    return [];
  }

  const entities = [];
  const normalized = text.trim();

  if (!normalized) return entities;

  // Heuristic: multi‑line content with braces or indentation is likely code/config.
  const lineCount = normalized.split(/\r?\n/).length;
  const hasBraces = /[{}`;]/.test(normalized);

  if (lineCount >= 4 && hasBraces) {
    entities.push({
      type: "CODE_BLOCK",
      value: "[multi-line code/config block]",
    });
  }

  // .env‑style lines: KEY=value
  const envMatches = normalized.matchAll(ENV_LINE_REGEX);
  for (const m of envMatches) {
    entities.push({
      type: "ENV_CONFIG",
      value: m[0],
    });
  }

  // Language‑specific clues
  for (const rx of CODE_CLUE_REGEXES) {
    if (rx.test(normalized)) {
      entities.push({
        type: "CODE_SYNTAX",
        value: rx.toString(),
      });
    }
  }

  if (entities.length > 0) {
    console.log("[scanner] Code detector entities:", entities);
  }

  return entities;
}

module.exports = {
  detectCode,
};
