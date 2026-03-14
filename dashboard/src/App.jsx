import { Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Logs from "./pages/Logs";
import Policies from "./pages/Policies";

export default function App() {
  return (
    <div
      style={{ fontFamily: "'DM Mono', monospace" }}
      className="min-h-screen bg-[#0a0a0f] text-white"
    >
      {/* Sidebar */}
      <div className="fixed top-0 left-0 h-full w-56 bg-[#0d0d14] border-r border-[#1a1a2e] flex flex-col z-50">
        {/* Logo */}
        <div className="px-6 py-6 border-b border-[#1a1a2e]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-cyan-500 flex items-center justify-center text-black font-bold text-xs">
              AP
            </div>
            <div>
              <div className="text-xs font-bold text-white tracking-widest">
                AI PROXY
              </div>
              <div className="text-[10px] text-gray-500 tracking-wider">
                SECURITY CONSOLE
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {[
            { to: "/", label: "Overview", icon: "▦" },
            { to: "/logs", label: "Security Logs", icon: "≡" },
            { to: "/policies", label: "Policies", icon: "⊞" },
          ].map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActive
                    ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                    : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                }`
              }
            >
              <span className="text-base">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Status */}
        <div className="px-4 py-4 border-t border-[#1a1a2e]">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            Proxy Active
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-56 p-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/policies" element={<Policies />} />
        </Routes>
      </div>
    </div>
  );
}
