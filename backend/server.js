require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { scanPrompt } = require("./scanner");
const { Log, Rule } = require("./models");

const app = express();
app.use(cors());
app.use(express.json());

// Connect MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

// ─────────────────────────────────────────
// ROUTE 1 — Core Scan Endpoint
// Called by Chrome Extension
// ─────────────────────────────────────────
app.post("/api/scan", async (req, res) => {
  const { message, text, department, source } = req.body;

  const rawText = typeof message === "string" && message.length > 0 ? message : text;

  if (!rawText) {
    return res.status(400).json({ error: "No message provided" });
  }

  try {
    // Step 1: Check department rules (admin-level policy, independent of content policy engine).
    const rule = await Rule.findOne({ department });
    if (rule && rule.action === "BLOCK") {
      await Log.create({
        originalMessage: rawText,
        redactedMessage: rawText,
        department,
        wasRedacted: false,
        wasBlocked: true,
        blockReason: `Department "${department}" is blocked by admin policy`,
        entitiesFound: [],
        riskLevel: "HIGH",
        source: source || "extension",
      });
      return res.json({
        action: "BLOCK",
        riskScore: 1.0,
        reasons: [`Department "${department}" is blocked by admin policy`],
        entities: [],
        redactedText: null,
      });
    }

    // Step 2: Run full scan pipeline (secrets + code + Python ML + single policy engine)
    const policyResult = await scanPrompt(rawText, {
      department,
      source,
    });

    const { action, riskScore, reasons, entities, redactedText } = policyResult;
    const wasRedacted = action === "REDACT" || action === "BLOCK";

    if (Array.isArray(entities) && entities.length > 0) {
      console.log("[backend] Detected entities:", entities);
    }

    // Map riskScore to riskLevel bucket for logs / dashboard only.
    let riskLevel = "NONE";
    if (riskScore >= 0.9) riskLevel = "HIGH";
    else if (riskScore >= 0.4) riskLevel = "MEDIUM";
    else if (riskScore > 0) riskLevel = "LOW";

    // Step 3: Log it
    await Log.create({
      originalMessage: rawText,
      redactedMessage: wasRedacted ? redactedText || rawText : rawText,
      department: department || "Unknown",
      wasRedacted,
      wasBlocked: action === "BLOCK",
      entitiesFound: entities,
      riskLevel,
      source: source || "extension",
    });

    // Step 4: Return clean, deterministic response contract
    res.json({
      action,
      riskScore,
      reasons,
      entities,
      redactedText: redactedText || null,
    });
  } catch (error) {
    console.error("Error in /api/scan:", error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ─────────────────────────────────────────
// ROUTE 2 — Get Logs (for dashboard)
// ─────────────────────────────────────────
app.get("/api/logs", async (req, res) => {
  const logs = await Log.find().sort({ timestamp: -1 }).limit(100);
  res.json(logs);
});

// ─────────────────────────────────────────
// ROUTE 3 — Stats (for dashboard)
// ─────────────────────────────────────────
app.get("/api/stats", async (req, res) => {
  const total = await Log.countDocuments();
  const blocked = await Log.countDocuments({ wasBlocked: true });
  const redacted = await Log.countDocuments({ wasRedacted: true });
  const high = await Log.countDocuments({ riskLevel: "HIGH" });
  const medium = await Log.countDocuments({ riskLevel: "MEDIUM" });
  const low = await Log.countDocuments({ riskLevel: "LOW" });
  res.json({ total, blocked, redacted, high, medium, low });
});

// ─────────────────────────────────────────
// ROUTE 4 — Rules (for dashboard)
// ─────────────────────────────────────────
app.get("/api/rules", async (req, res) => {
  const rules = await Rule.find();
  res.json(rules);
});

app.post("/api/rules", async (req, res) => {
  const { department, action } = req.body;
  const existing = await Rule.findOne({ department });
  if (existing) {
    existing.action = action;
    await existing.save();
    return res.json(existing);
  }
  const rule = await Rule.create({ department, action });
  res.json(rule);
});

app.delete("/api/rules/:id", async (req, res) => {
  await Rule.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ─────────────────────────────────────────
// ROUTE 5 — Admin reset (clear all data)
// ─────────────────────────────────────────
app.delete("/api/admin/reset", async (req, res) => {
  try {
    await Log.deleteMany({});
    await Rule.deleteMany({});
    res.json({ success: true, message: "All logs and rules deleted" });
  } catch (err) {
    console.error("Reset error:", err);
    res.status(500).json({ error: "Failed to reset data" });
  }
});

// ─────────────────────────────────────────
app.listen(process.env.PORT, () => {
  console.log(`Backend running on port ${process.env.PORT}`);
});
