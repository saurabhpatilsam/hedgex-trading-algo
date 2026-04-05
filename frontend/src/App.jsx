import { useState, Component } from "react";
import AccountManager from "./components/AccountManager";
import GroupManager from "./components/GroupManager";
import StrategyPanel from "./components/StrategyPanel";
import TradingDashboard from "./components/TradingDashboard";
import NetworkLogs from "./components/NetworkLogs";
import "./App.css";

// ── Error Boundary ─────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          color: '#ff6b6b',
          background: '#0a0a0f',
          minHeight: '100vh',
          fontFamily: 'monospace'
        }}>
          <h1>⚠️ Application Error</h1>
          <p style={{ color: '#fff', fontSize: '16px' }}>
            Something crashed during rendering. Details below:
          </p>
          <pre style={{
            background: '#1a1a2e',
            padding: '20px',
            borderRadius: '8px',
            overflow: 'auto',
            color: '#ff9999',
            fontSize: '13px',
            lineHeight: '1.5'
          }}>
            {this.state.error?.toString()}
            {this.state.errorInfo?.componentStack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '10px 24px',
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}

export default App;
