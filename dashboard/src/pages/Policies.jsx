import { useEffect, useState } from "react";
import axios from "axios";

const API = "http://localhost:3000";

const DEPARTMENTS = [
  "Engineering",
  "Marketing",
  "HR",
  "Finance",
  "Legal",
  "Sales",
  "Operations",
  "Design",
];

export default function Policies() {
  const [rules, setRules] = useState([]);
  const [department, setDepartment] = useState("");
  const [action, setAction] = useState("BLOCK");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRules();
  }, []);

  async function fetchRules() {
    try {
      const res = await axios.get(`${API}/api/rules`);
      setRules(res.data);
    } catch (e) {}
  }

  async function addRule() {
    if (!department.trim()) return;
    setSaving(true);
    try {
      await axios.post(`${API}/api/rules`, { department, action });
      setDepartment("");
      fetchRules();
    } catch (e) {}
    setSaving(false);
  }

  async function deleteRule(id) {
    try {
      await axios.delete(`${API}/api/rules/${id}`);
      fetchRules();
    } catch (e) {}
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <div className="text-xs text-cyan-500 tracking-widest mb-1">
          ACCESS CONTROL
        </div>
        <h1 className="text-2xl font-bold text-white">Policy Management</h1>
        <p className="text-gray-500 text-sm mt-1">
          Set department-level AI access rules
        </p>
      </div>

      {/* Add Rule */}
      <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-xl p-6 mb-6">
        <div className="text-xs text-gray-500 tracking-widest mb-4">
          NEW POLICY RULE
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-600 tracking-wider block mb-1.5">
              DEPARTMENT
            </label>
            <input
              type="text"
              placeholder="e.g. Engineering"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              list="dept-list"
              className="w-full bg-[#0a0a0f] border border-[#1a1a2e] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
            />
            <datalist id="dept-list">
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="text-xs text-gray-600 tracking-wider block mb-1.5">
              ACTION
            </label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/50 h-[42px]"
            >
              <option value="BLOCK">BLOCK</option>
              <option value="ALLOW">ALLOW</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={addRule}
              disabled={saving || !department.trim()}
              className="bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 px-5 py-2.5 rounded-lg text-sm font-bold tracking-wider transition-all disabled:opacity-40 h-[42px]"
            >
              {saving ? "..." : "+ ADD"}
            </button>
          </div>
        </div>
      </div>

      {/* Rules List */}
      <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1a1a2e]">
          <div className="text-xs text-gray-500 tracking-widest">
            ACTIVE RULES ({rules.length})
          </div>
        </div>

        {rules.length === 0 && (
          <div className="text-center text-gray-600 py-12 text-sm">
            No rules configured. All departments have default access.
          </div>
        )}

        {rules.map((rule) => (
          <div
            key={rule._id}
            className="flex items-center justify-between px-6 py-4 border-t border-[#1a1a2e] hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-lg bg-[#1a1a2e] flex items-center justify-center text-xs text-gray-400 font-bold">
                {rule.department[0]}
              </div>
              <div>
                <div className="text-sm text-white font-medium">
                  {rule.department}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Added {new Date(rule.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span
                className={`px-3 py-1 rounded-lg text-xs font-bold tracking-widest border ${
                  rule.action === "BLOCK"
                    ? "bg-red-950/50 text-red-400 border-red-900/50"
                    : "bg-green-950/50 text-green-400 border-green-900/50"
                }`}
              >
                {rule.action}
              </span>
              <button
                onClick={() => deleteRule(rule._id)}
                className="text-gray-600 hover:text-red-400 transition-colors text-xs tracking-wider"
              >
                REMOVE
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-cyan-950/20 border border-cyan-900/30 rounded-xl p-4">
        <div className="text-xs text-cyan-400 font-bold tracking-wider mb-2">
          HOW RULES WORK
        </div>
        <div className="text-xs text-gray-500 space-y-1">
          <p>
            • <span className="text-red-400">BLOCK</span> — All AI prompts from
            this department are blocked entirely
          </p>
          <p>
            • <span className="text-green-400">ALLOW</span> — Department can use
            AI (PII scanning still applies)
          </p>
          <p>• Departments with no rule follow default scanning behaviour</p>
        </div>
      </div>
    </div>
  );
}
