import { useEffect, useState } from "react";
import axios from "axios";
import { Pie, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from "chart.js";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
);

const API = "http://localhost:3000";

export default function Dashboard() {
  const [stats, setStats] = useState({
    total: 0,
    blocked: 0,
    redacted: 0,
    high: 0,
    medium: 0,
    low: 0,
  });
  const [logs, setLogs] = useState([]);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchAll() {
    try {
      const [s, l] = await Promise.all([
        axios.get(`${API}/api/stats`),
        axios.get(`${API}/api/logs`),
      ]);
      setStats(s.data);
      setLogs(l.data);
    } catch (e) {}
  }

  async function handleClear() {
    if (clearing) return;
    const confirmClear = window.confirm(
      "This will delete ALL logs and policy rules. Continue?",
    );
    if (!confirmClear) return;
    setClearing(true);
    try {
      await axios.delete(`${API}/api/admin/reset`);
      // Reset local state immediately for instant feedback
      setStats({
        total: 0,
        blocked: 0,
        redacted: 0,
        high: 0,
        medium: 0,
        low: 0,
      });
      setLogs([]);
    } catch (e) {
      console.error("Failed to clear data", e);
    }
    setClearing(false);
  }

  // Platform counts from logs
  const platforms = ["ChatGPT", "Claude", "Gemini"];
  const platformCounts = platforms.map(
    (p) =>
      logs.filter((l) => l.source?.toLowerCase().includes(p.toLowerCase()))
        .length,
  );

  const pieData = {
    labels: ["High Risk", "Medium Risk", "Low Risk"],
    datasets: [
      {
        data: [stats.high || 0, stats.medium || 0, stats.low || 0],
        backgroundColor: ["#ef4444", "#f59e0b", "#10b981"],
        borderColor: ["#991b1b", "#92400e", "#065f46"],
        borderWidth: 1,
      },
    ],
  };

  const barData = {
    labels: platforms,
    datasets: [
      {
        label: "Prompts",
        data: platformCounts,
        backgroundColor: "rgba(6, 182, 212, 0.3)",
        borderColor: "rgb(6, 182, 212)",
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  const chartOptions = {
    plugins: {
      legend: { labels: { color: "#9ca3af", font: { size: 11 } } },
    },
  };

  const barOptions = {
    ...chartOptions,
    scales: {
      x: { ticks: { color: "#6b7280" }, grid: { color: "#1a1a2e" } },
      y: { ticks: { color: "#6b7280" }, grid: { color: "#1a1a2e" } },
    },
  };

  const statCards = [
    {
      label: "Total Scanned",
      value: stats.total,
      color: "cyan",
      border: "border-cyan-500/20",
      text: "text-cyan-400",
    },
    {
      label: "Blocked",
      value: stats.blocked,
      color: "red",
      border: "border-red-500/20",
      text: "text-red-400",
    },
    {
      label: "Redacted",
      value: stats.redacted,
      color: "yellow",
      border: "border-yellow-500/20",
      text: "text-yellow-400",
    },
    {
      label: "High Risk",
      value: stats.high || 0,
      color: "red",
      border: "border-red-900/40",
      text: "text-red-500",
    },
    {
      label: "Medium Risk",
      value: stats.medium || 0,
      color: "yellow",
      border: "border-yellow-900/40",
      text: "text-yellow-500",
    },
    {
      label: "Low Risk",
      value: stats.low || 0,
      color: "green",
      border: "border-green-900/40",
      text: "text-green-500",
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-cyan-500 tracking-widest mb-1">
            SECURITY OVERVIEW
          </div>
          <h1 className="text-2xl font-bold text-white">AI Proxy Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            Real-time monitoring of AI prompt security
          </p>
        </div>
        <button
          onClick={handleClear}
          disabled={clearing}
          className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-40"
        >
          {clearing ? "Clearing..." : "Clear Data"}
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
        {statCards.map((card, i) => (
          <div
            key={i}
            className={`bg-[#0d0d14] border ${card.border} rounded-xl p-4`}
          >
            <div className="text-gray-500 text-xs mb-2 tracking-wider">
              {card.label.toUpperCase()}
            </div>
            <div className={`text-3xl font-bold ${card.text}`}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-xl p-6">
          <div className="text-xs text-gray-500 tracking-widest mb-4">
            RISK DISTRIBUTION
          </div>
          <div className="h-52 flex items-center justify-center">
            {stats.high + stats.medium + stats.low > 0 ? (
              <Pie data={pieData} options={chartOptions} />
            ) : (
              <p className="text-gray-600 text-sm">No data yet</p>
            )}
          </div>
        </div>
        <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-xl p-6">
          <div className="text-xs text-gray-500 tracking-widest mb-4">
            AI PLATFORM USAGE
          </div>
          <div className="h-52">
            <Bar data={barData} options={barOptions} />
          </div>
        </div>
      </div>

      {/* Recent Logs Preview */}
      <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1a1a2e] flex justify-between items-center">
          <div className="text-xs text-gray-500 tracking-widest">
            RECENT EVENTS
          </div>
          <span className="text-xs text-cyan-500">Live • updates every 5s</span>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-[#0a0a0f]">
            <tr className="text-gray-600 tracking-widest">
              {["TIME", "PLATFORM", "RISK", "ACTION", "ENTITIES"].map((h) => (
                <th key={h} className="text-left px-5 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.slice(0, 8).map((log, i) => (
              <LogRow key={i} log={log} />
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-gray-600 py-10">
                  No events yet. Send a prompt through the proxy.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LogRow({ log }) {
  const riskColors = {
    HIGH: "text-red-400 bg-red-950/50",
    MEDIUM: "text-yellow-400 bg-yellow-950/50",
    LOW: "text-green-400 bg-green-950/50",
    NONE: "text-gray-400 bg-gray-900/50",
  };
  const actionColors = {
    BLOCK: "text-red-400",
    REDACT: "text-yellow-400",
    WARN: "text-blue-400",
    ALLOW: "text-green-400",
  };

  return (
    <tr className="border-t border-[#1a1a2e] hover:bg-white/[0.02] transition-colors">
      <td className="px-5 py-3 text-gray-500">
        {new Date(log.timestamp).toLocaleTimeString()}
      </td>
      <td className="px-5 py-3 text-gray-300">
        {log.source?.split(".")[0] || "Unknown"}
      </td>
      <td className="px-5 py-3">
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${riskColors[log.riskLevel] || riskColors.NONE}`}
        >
          {log.riskLevel || "NONE"}
        </span>
      </td>
      <td
        className={`px-5 py-3 font-bold tracking-wider ${actionColors[log.wasBlocked ? "BLOCK" : log.wasRedacted ? "REDACT" : "ALLOW"]}`}
      >
        {log.wasBlocked ? "BLOCK" : log.wasRedacted ? "REDACT" : "ALLOW"}
      </td>
      <td className="px-5 py-3">
        <div className="flex flex-wrap gap-1">
          {log.entitiesFound?.slice(0, 3).map((e, i) => (
            <span
              key={i}
              className="bg-[#1a1a2e] text-cyan-400 px-1.5 py-0.5 rounded text-[10px]"
            >
              {e.type}
            </span>
          ))}
          {log.entitiesFound?.length === 0 && (
            <span className="text-gray-600">—</span>
          )}
        </div>
      </td>
    </tr>
  );
}
