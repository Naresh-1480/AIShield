const HIGH_RISK_TYPES = new Set([
  "SSN",
  "CREDIT_CARD",
  "API_KEY",
  "PRIVATE_KEY",
  "PASSWORD",
  "INTELLECTUAL_PROPERTY",
]);

const MEDIUM_RISK_TYPES = new Set([
  "EMAIL",
  "PHONE",
  "SOURCE_CODE",
  "DATABASE_URL",
  "CONFIDENTIAL_DATA",
]);

const LOW_RISK_TYPES = new Set(["NAME", "IP_ADDRESS"]);

const LEVEL_PRIORITY = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

function getEntityRisk(entityType) {
  if (HIGH_RISK_TYPES.has(entityType)) {
    return { level: "HIGH", weight: 3 };
  }
  if (MEDIUM_RISK_TYPES.has(entityType)) {
    return { level: "MEDIUM", weight: 2 };
  }
  if (LOW_RISK_TYPES.has(entityType)) {
    return { level: "LOW", weight: 1 };
  }
  return { level: "NONE", weight: 0 };
}

function calculateRiskScoreAndLevel(entities) {
  if (!Array.isArray(entities) || entities.length === 0) {
    return { level: "NONE", score: 0 };
  }

  let totalWeight = 0;
  let maxLevel = "NONE";

  for (const entity of entities) {
    const { level, weight } = getEntityRisk(entity.type);
    totalWeight += weight;
    if (LEVEL_PRIORITY[level] > LEVEL_PRIORITY[maxLevel]) {
      maxLevel = level;
    }
  }

  const score = Math.max(0, Math.min(100, totalWeight * 10));

  const finalLevel = maxLevel === "NONE" && score > 0 ? "LOW" : maxLevel;

  return {
    level: finalLevel,
    score,
  };
}

module.exports = {
  HIGH_RISK_TYPES,
  MEDIUM_RISK_TYPES,
  LOW_RISK_TYPES,
  getEntityRisk,
  calculateRiskScoreAndLevel,
};

