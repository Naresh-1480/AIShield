/**
 * Scanner Pipeline Test Suite — Enterprise Focus
 *
 * Tests the scan pipeline against real-world enterprise prompts.
 * Covers the org's Shadow AI threat model:
 *   BLOCK  → credentials, secrets, confidential markers, HR data (SSN)
 *   REDACT → employee/client PII, internal infra, code/config leaks
 *   ALLOW  → coding questions, general queries, safe business chat
 *
 * Usage: node test-scanner.js
 * Requires Python ML service running (optional — tests fallback too).
 */

const { scanPrompt } = require("./scanner");

const TEST_CASES = [
  // ═══ BLOCK — Credential / Secret Exposure ═══
  {
    name: "OpenAI API key",
    prompt: "Here is my api key: sk-proj-abcdefghijklmnopqrstuvwxyz1234",
    expect: "BLOCK",
  },
  {
    name: "Password sharing",
    prompt: "my password is SuperSecret123!@#",
    expect: "BLOCK",
  },
  {
    name: "AWS access key",
    prompt: "My AWS access key is AKIAIOSFODNN7EXAMPLE",
    expect: "BLOCK",
  },
  {
    name: "Database connection string",
    prompt: "Connect to mongodb://admin:pass123@prod-db.company.com:27017/users",
    expect: "BLOCK",
  },
  {
    name: "Private key (PEM)",
    prompt: "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQE...\n-----END PRIVATE KEY-----",
    expect: "BLOCK",
  },
  {
    name: "SSN with explicit HR context",
    prompt: "Employee SSN is 123-45-6789, please update payroll",
    expect: "BLOCK",
  },
  {
    name: "Confidential marker",
    prompt: "CONFIDENTIAL — Internal pricing: Enterprise tier is $50k/year. Do not share.",
    expect: "BLOCK",
  },
  {
    name: "JWT token",
    prompt: "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV",
    expect: "BLOCK",
  },

  // ═══ REDACT — PII / Internal Infra / Code Leak ═══
  {
    name: "Employee email address",
    prompt: "My work email is john.smith@acme-corp.com, can you draft a reply?",
    expect: "REDACT",
  },
  {
    name: "Phone number",
    prompt: "Call me at 555-123-4567 to discuss the Q3 plan",
    expect: "REDACT",
  },
  {
    name: "Internal URL",
    prompt: "Check the runbook at https://wiki.internal.company.corp/onboarding",
    expect: "REDACT",
  },
  {
    name: "AWS ARN",
    prompt: "The resource is arn:aws:s3:::my-company-secure-bucket/reports",
    expect: "REDACT",
  },
  {
    name: "Env config block",
    prompt: "DB_HOST=prod-db.internal\nDB_USER=admin\nDB_PASS=secret123\nAPI_KEY=abc123xyz",
    expect: "REDACT",
  },
  {
    name: "Proprietary source code paste",
    prompt: `Here is our auth service code:
import jwt from 'jsonwebtoken';
class AuthService {
  constructor(secret) {
    this.secret = secret;
  }
  verify(token) {
    return jwt.verify(token, this.secret);
  }
}
module.exports = { AuthService };`,
    expect: "REDACT",
  },

  // ═══ ALLOW — Safe Enterprise Queries ═══
  {
    name: "Coding help (generic)",
    prompt: "Write a Python function to sort a list of dictionaries by a key",
    expect: "ALLOW",
  },
  {
    name: "General technical question",
    prompt: "What is the difference between REST and GraphQL?",
    expect: "ALLOW",
  },
  {
    name: "Safe business question",
    prompt: "Help me write an agenda for a Q3 planning meeting",
    expect: "ALLOW",
  },
  {
    name: "SQL help (no schema leakage)",
    prompt: "How do I write a JOIN query that groups results by date?",
    expect: "ALLOW",
  },
  {
    name: "Email draft (no PII)",
    prompt: "Draft a professional follow-up email after a sales demo",
    expect: "ALLOW",
  },
];

async function runTests() {
  console.log("==============================================");
  console.log("  SCANNER PIPELINE TEST SUITE [Enterprise]");
  console.log("==============================================\n");

  let passed = 0;
  let failed = 0;
  const failures = [];

  // Suppress internal scanner logs during test run
  const origLog = console.log;
  const origError = console.error;

  for (const tc of TEST_CASES) {
    console.log = () => {};
    console.error = () => {};

    try {
      const result = await scanPrompt(tc.prompt);
      const actual = result.action;
      const ok = actual === tc.expect;

      console.log = origLog;
      console.error = origError;

      if (ok) {
        passed++;
        console.log(`  PASS ${tc.name}: ${actual}`);
      } else {
        failed++;
        console.log(`  FAIL ${tc.name}: expected=${tc.expect} got=${actual}`);
        console.log(`       risk=${result.riskScore} | ${result.reasons.join("; ")}`);
        failures.push(tc.name);
      }
    } catch (err) {
      console.log = origLog;
      console.error = origError;
      failed++;
      console.log(`  ERROR ${tc.name}: ${err.message}`);
      failures.push(tc.name);
    }
  }

  console.log("\n==============================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed / ${TEST_CASES.length} total`);
  if (failures.length > 0) {
    console.log(`  FAILURES: ${failures.join(", ")}`);
  }
  console.log("==============================================");

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
