import { useEffect, useState } from "react";
import axios from "axios";

const API = "http://localhost:3000";

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchLogs() {
    try {
      const res = await axios.get(`${API}/api/logs`);
      setLogs(res.data);
    } catch (e) {}
  }

  const filtered = logs.filter((log) => {
    const matchFilter =
      filter === "ALL" ||
      (filter === "BLOCKED" && log.wasBlocked) ||
      (filter === "REDACTED" && log.wasRedacted && !log.wasBlocked) ||
      (filter === "CLEAN" && !log.wasBlocked && !log.wasRedacted);
    const matchSearch =
      !search ||
      log.originalMessage?.toLowerCase().includes(search.toLowerCase()) ||
      log.source?.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const riskColors = {
    HIGH: "text-red-400 bg-red-950/50 border-red-900/50",
    MEDIUM: "text-yellow-400 bg-yellow-950/50 border-yellow-900/50",
    LOW: "text-green-400 bg-green-950/50 border-green-900/50",
    NONE: "text-gray-400 bg-gray-900/50 border-gray-800",
  };

  return (
    <div>
      <div className="mb-8">
        <div className="text-xs text-cyan-500 tracking-widest mb-1">
          AUDIT TRAIL
        </div>
        <h1 className="text-2xl font-bold text-white">Security Logs</h1>
        <p className="text-gray-500 text-sm mt-1">All intercepted AI prompts</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Search prompts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-[#0d0d14] border border-[#1a1a2e] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
        />
        {["ALL", "BLOCKED", "REDACTED", "CLEAN"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-xs font-bold tracking-widest transition-all ${
              filter === f
                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                : "bg-[#0d0d14] text-gray-500 border border-[#1a1a2e] hover:text-gray-300"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Logs */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center text-gray-600 py-20 bg-[#0d0d14] border border-[#1a1a2e] rounded-xl">
            No logs found
          </div>
        )}
        {filtered.map((log, i) => (
          <div
            key={i}
            className="bg-[#0d0d14] border border-[#1a1a2e] rounded-xl p-4 hover:border-cyan-500/20 transition-all"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-gray-500 text-xs">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                  <span className="text-gray-700">•</span>
                  <span className="text-xs text-gray-400">
                    {log.source || "Unknown"}
                  </span>
                  <span className="text-gray-700">•</span>
                  <span className="text-xs text-gray-400">
                    {log.department || "Unknown dept"}
                  </span>
                </div>

                <p className="text-sm text-gray-300 truncate mb-2">
                  {log.originalMessage?.length > 120
                    ? log.originalMessage.slice(0, 120) + "..."
                    : log.originalMessage}
                </p>

                {log.wasRedacted && log.redactedMessage && (
                  <p className="text-xs text-yellow-400/70 truncate">
                    ✂ Redacted: {log.redactedMessage?.slice(0, 100)}
                  </p>
                )}

                {log.entitiesFound?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {log.entitiesFound.map((e, j) => (
                      <span
                        key={j}
                        className="bg-[#1a1a2e] text-cyan-400/70 px-2 py-0.5 rounded text-[10px] border border-cyan-900/30"
                      >
                        {e.type}: {String(e.value).slice(0, 20)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider border ${riskColors[log.riskLevel] || riskColors.NONE}`}
                >
                  {log.riskLevel || "NONE"}
                </span>
                <span
                  className={`text-xs font-bold tracking-widest ${
                    log.wasBlocked
                      ? "text-red-400"
                      : log.wasRedacted
                        ? "text-yellow-400"
                        : "text-green-400"
                  }`}
                >
                  {log.wasBlocked
                    ? "🚫 BLOCKED"
                    : log.wasRedacted
                      ? "✂ REDACTED"
                      : "✅ ALLOWED"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
