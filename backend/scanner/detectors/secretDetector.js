/**
 * Secret & Internal Infrastructure Detector.
 *
 * Detects enterprise-critical secrets and infrastructure details:
 *
 * HIGH SEVERITY (→ BLOCK):
 *  - API keys (OpenAI, AWS, GitHub, Stripe, Slack, generic)
 *  - Passwords / auth tokens
 *  - Private keys (PEM)
 *  - Database connection strings
 *  - JWTs
 *
 * MEDIUM SEVERITY (→ REDACT):
 *  - Internal URLs / endpoints (intranet, staging, internal APIs)
 *  - Cloud resource identifiers (ARN, S3 buckets, GCP projects)
 *  - Server hostnames / internal domains
 *  - Environment variables with values
 */

// ─── HIGH SEVERITY SECRETS ────────────────────────────────────
const OPENAI_KEY_REGEX = /sk-[a-zA-Z0-9_-]{20,}/g;
const AWS_KEY_REGEX = /AKIA[0-9A-Z]{16}/g;
const GITHUB_TOKEN_REGEX = /ghp_[A-Za-z0-9]{36}/g;
const JWT_REGEX = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const PRIVATE_KEY_REGEX =
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g;
const DATABASE_URL_REGEX =
  /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|mssql):\/\/[^\s'"]+/g;
const STRIPE_KEY_REGEX = /(?:sk_live_|pk_live_|sk_test_|pk_test_)[a-zA-Z0-9]{24,}/g;
const SLACK_TOKEN_REGEX = /xox[bpae]-[a-zA-Z0-9_-]{8,}/g;

// Generic "api key" / "apikey" / "api_key" = value (min 16 chars for the token)
const GENERIC_API_KEY_REGEX =
  /\b(?:api[_\s-]?key|apikey|api[_\s-]?secret|api[_\s-]?token)\s*[:=]\s*["']?([a-zA-Z0-9_\-.]{16,})/gi;

// Password-like in natural language: "password = xxx", "password: xxx", "my password is xxx"
// Separator allows optional '= ', ': ', or 'is ' between the keyword and the value.
const PASSWORD_REGEX =
  /\b(password|passwd|pwd|auth_token|access_token|bearer)\b[\s:='"]*(?:is\s+)?([^\s'"]{4,})/gi;

// Env-var style credentials: DB_PASSWORD=xxx, MYSQL_ROOT_PASSWORD=secret, APP_SECRET_KEY=abc123
// \b won't fire before _PASSWORD because _ is a word char — this catches it explicitly.
const ENV_PASSWORD_REGEX =
  /(?:^|\s)(?:[A-Z][A-Z0-9_]*_)?(?:PASSWORD|PASSWD|PWD|SECRET|AUTH_TOKEN|ACCESS_TOKEN|PRIVATE_KEY)\s*=\s*([^\s'"]{4,})/gm;

// ─── MEDIUM SEVERITY: INFRASTRUCTURE ──────────────────────────
// Internal URLs: *.internal, *.local, *.corp, staging/dev subdomains
const INTERNAL_URL_REGEX =
  /\bhttps?:\/\/[a-zA-Z0-9._-]+\.(?:internal|local|corp|intranet|staging|dev)\b[^\s]*/gi;

// AWS ARN — account ID segment is optional (S3 ARNs can be account-less)
const AWS_ARN_REGEX = /\barn:aws:[a-zA-Z0-9*_-]+:[a-z0-9-]*:(?:\d{12})?:[^\s'"]+/g;

// S3 bucket references
const S3_BUCKET_REGEX = /\b(?:s3:\/\/[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]|[a-z0-9][a-z0-9.-]+\.s3\.amazonaws\.com)\b/gi;

// Server hostnames / internal domains
const INTERNAL_HOSTNAME_REGEX =
  /\b(?:(?:prod|staging|dev|internal|db|api|admin|vpn|jump|bastion)[.-])[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}\b/gi;

// Docker / K8s references
const CONTAINER_REGEX =
  /\b(?:docker\.io|gcr\.io|ecr\.[a-z-]+\.amazonaws\.com)\/[a-zA-Z0-9._/-]+(?::[a-zA-Z0-9._-]+)?\b/g;

function buildEntities(type, matches) {
  const entities = [];
  for (const match of matches) {
    const value = type === "PASSWORD" && match[2] ? match[2] : match[0];
    entities.push({ type, value });
  }
  return entities;
}

function detectSecrets(text) {
  if (!text || typeof text !== "string") {
    return [];
  }

  const entities = [];

  // HIGH severity secrets
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

  // Env-var style credentials: DB_PASSWORD=xxx, APP_SECRET=xxx
  for (const match of text.matchAll(ENV_PASSWORD_REGEX)) {
    if (match[1]) {
      entities.push({ type: "PASSWORD", value: match[1] });
    }
  }

  // Generic api key = xxx
  for (const match of text.matchAll(GENERIC_API_KEY_REGEX)) {
    if (match[1]) {
      entities.push({ type: "API_KEY", value: match[1] });
    }
  }

  // MEDIUM severity: infrastructure
  entities.push(
    ...buildEntities("INTERNAL_URL", text.matchAll(INTERNAL_URL_REGEX)),
    ...buildEntities("AWS_ARN", text.matchAll(AWS_ARN_REGEX)),
    ...buildEntities("S3_BUCKET", text.matchAll(S3_BUCKET_REGEX)),
    ...buildEntities("INTERNAL_HOSTNAME", text.matchAll(INTERNAL_HOSTNAME_REGEX)),
    ...buildEntities("CONTAINER_IMAGE", text.matchAll(CONTAINER_REGEX)),
  );

  if (entities.length > 0) {
    console.log("[scanner] Secret/infra detector entities:", entities);
  }

  return entities;
}

module.exports = {
  detectSecrets,
};
