/**
 * Code / config leak detector.
 *
 * Detects:
 *  - Proprietary source code pastes (multi-line code blocks with language clues)
 *  - .env-style configuration with secrets
 *  - Internal config / auth snippets
 *  - Confidential business identifiers (project names, internal references)
 *
 * This detector only reports *what* it sees. It never decides ALLOW/REDACT/BLOCK.
 * The policy engine is the single place that makes final decisions.
 *
 * Tuning notes:
 *  - CODE_BLOCK requires ≥6 lines AND ≥2 code-specific clues to avoid false
 *    positives on normal multi-line messages.
 *  - Single code clue matches are reported as CODE_HINT (low risk) not CODE_SYNTAX.
 *  - ENV_CONFIG patterns are always flagged since they typically contain secrets.
 */

const ENV_LINE_REGEX = /^[A-Z][A-Z0-9_]{2,32}\s*=\s*.+$/gm;

const CODE_CLUE_REGEXES = [
  { rx: /function\s+[a-zA-Z0-9_]+\s*\(/, lang: "js/ts" },
  { rx: /\bclass\s+[A-Z][A-Za-z0-9_]*\s*[{(]/, lang: "oop" },
  { rx: /\bdef\s+[a-zA-Z0-9_]+\s*\(/, lang: "python" },
  { rx: /import\s+[\w*{}\s,]+from\s+['"].+['"]/, lang: "es-module" },
  { rx: /#include\s+<.+>/, lang: "c/c++" },
  { rx: /const\s+\w+\s*=\s*require\s*\(/, lang: "commonjs" },
  { rx: /System\.out\.println\s*\(/, lang: "java" },
  { rx: /public\s+(?:static\s+)?(?:void|int|String)\s+\w+\s*\(/, lang: "java" },
  { rx: /\bpackage\s+[a-z][a-z0-9_.]+;/, lang: "java/go" },
  { rx: /\bfunc\s+\w+\s*\(/, lang: "go" },
  { rx: /\b(?:SELECT|INSERT|UPDATE|DELETE)\s+.*\bFROM\b/i, lang: "sql" },
  { rx: /CREATE\s+TABLE\s+/i, lang: "sql" },
  // Additional JS/TS patterns
  { rx: /const\s+\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/, lang: "arrow-fn" },
  { rx: /\breturn\s+[^;\n]{3,};/, lang: "return-stmt" },
  { rx: /(?:const|let|var)\s+\w+\s*=\s*[^;\n]+;/, lang: "var-decl" },
  { rx: /\bif\s*\([^)]+\)\s*\{/, lang: "control-flow" },
  { rx: /\.(?:then|catch|finally)\s*\(/, lang: "promise-chain" },
  { rx: /require\s*\(['"][^'"]+['"]\)/, lang: "require" },
];

// Proprietary / confidential markers
const CONFIDENTIAL_MARKERS = [
  /\b(?:CONFIDENTIAL|PROPRIETARY|INTERNAL\s+USE\s+ONLY|DO\s+NOT\s+SHARE|TRADE\s+SECRET)\b/i,
  /\bCopyright\s+©?\s*\d{4}\s+[A-Z][a-zA-Z\s]+(?:Inc|LLC|Corp|Ltd)/i,
  /\bALL\s+RIGHTS\s+RESERVED\b/i,
];

function detectCode(text) {
  if (!text || typeof text !== "string") {
    return [];
  }

  const entities = [];
  const normalized = text.trim();
  if (!normalized) return entities;

  const lines = normalized.split(/\r?\n/);
  const lineCount = lines.length;

  // Count how many different code clues match
  const matchedClues = [];
  for (const { rx, lang } of CODE_CLUE_REGEXES) {
    if (rx.test(normalized)) {
      matchedClues.push(lang);
    }
  }

  // CODE_BLOCK detection — two tiers:
  //  Tier A: ≥6 lines + ≥2 distinct clues + braces  → clear code paste
  //  Tier B: ≥8 lines + ≥1 clue + braces            → single-function / algorithm paste
  const hasBraces = /[{}]/.test(normalized);
  const clueCount = matchedClues.length;

  if (
    hasBraces &&
    (
      (lineCount >= 6 && clueCount >= 2) ||
      (lineCount >= 8 && clueCount >= 1)
    )
  ) {
    entities.push({
      type: "CODE_BLOCK",
      value: `[multi-line code block, ${lineCount} lines, clues: ${matchedClues.join(", ")}]`,
    });
  }

  // .env-style lines: KEY=value (always risky)
  const envMatches = [...normalized.matchAll(ENV_LINE_REGEX)];
  if (envMatches.length >= 2) {
    // Only flag if there are ≥2 env lines (single KEY=value not enough)
    for (const m of envMatches) {
      entities.push({
        type: "ENV_CONFIG",
        value: m[0],
      });
    }
  }

  // Confidential markers
  for (const rx of CONFIDENTIAL_MARKERS) {
    const match = normalized.match(rx);
    if (match) {
      entities.push({
        type: "CONFIDENTIAL_MARKER",
        value: match[0],
      });
    }
  }

  // SQL with table/column data — potential data schema exposure
  if (/\bCREATE\s+TABLE\b/i.test(normalized) || /\bALTER\s+TABLE\b/i.test(normalized)) {
    entities.push({
      type: "DATABASE_SCHEMA",
      value: "[database schema definition]",
    });
  }

  if (entities.length > 0) {
    console.log("[scanner] Code detector entities:", entities);
  }

  return entities;
}

module.exports = {
  detectCode,
};
