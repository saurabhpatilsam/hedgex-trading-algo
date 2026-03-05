import { useState } from "react";
import AccountManager from "./components/AccountManager";
import GroupManager from "./components/GroupManager";
import StrategyPanel from "./components/StrategyPanel";
import TradingDashboard from "./components/TradingDashboard";
import NetworkLogs from "./components/NetworkLogs";
import "./App.css";

const TABS = [
  { id: "trading", label: "Trading", icon: "🎯" },
  { id: "accounts", label: "Accounts", icon: "👥" },
  { id: "groups", label: "Groups", icon: "🔗" },
  { id: "strategy", label: "Strategy Control", icon: "⚡" },
  { id: "logs", label: "Network Logs", icon: "📡" },
];

function App() {
  const [activeTab, setActiveTab] = useState("trading");

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon"><img src="/orca-logo.png" alt="Orca" style={{ width: 28, height: 28, borderRadius: 6 }} /></div>
          <div className="brand-text">
            <h1>Orca</h1>
            <span>Trading System</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="nav-icon">{tab.icon}</span>
              <span className="nav-label">{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="version-tag">v3.0.0</div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {activeTab === "trading" && <TradingDashboard />}
        {activeTab === "accounts" && <AccountManager />}
        {activeTab === "groups" && <GroupManager />}
        {activeTab === "strategy" && <StrategyPanel />}
        {activeTab === "logs" && <NetworkLogs />}
      </main>
    </div>
  );
}

export default App;
