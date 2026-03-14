const mongoose = require("mongoose");

const LogSchema = new mongoose.Schema({
  originalMessage: String,
  redactedMessage: String,
  department: { type: String, default: "Unknown" },
  wasRedacted: Boolean,
  wasBlocked: Boolean,
  blockReason: String,
  entitiesFound: Array,
  riskLevel: {
    type: String,
    enum: ["NONE", "LOW", "MEDIUM", "HIGH"],
    default: "NONE",
  },
  source: { type: String, default: "extension" }, // which AI site
  timestamp: { type: Date, default: Date.now },
});

const RuleSchema = new mongoose.Schema({
  department: String,
  action: { type: String, enum: ["ALLOW", "BLOCK"] },
  createdAt: { type: Date, default: Date.now },
});

const Log = mongoose.model("Log", LogSchema);
const Rule = mongoose.model("Rule", RuleSchema);

module.exports = { Log, Rule };
