import { useState, useEffect, useCallback } from "react";
import { brokerApi } from "../api";

const STATUS_COLORS = {
    working: { bg: "rgba(59,130,246,0.15)", text: "#60a5fa", border: "rgba(59,130,246,0.3)" },
    filled: { bg: "rgba(34,197,94,0.15)", text: "#4ade80", border: "rgba(34,197,94,0.3)" },
    rejected: { bg: "rgba(239,68,68,0.15)", text: "#f87171", border: "rgba(239,68,68,0.3)" },
    cancelled: { bg: "rgba(107,114,128,0.15)", text: "#9ca3af", border: "rgba(107,114,128,0.3)" },
    expired: { bg: "rgba(168,85,247,0.15)", text: "#c084fc", border: "rgba(168,85,247,0.3)" },
};

const SIDE_COLORS = {
    buy: "#22c55e",
    sell: "#ef4444",
    long: "#22c55e",
    short: "#ef4444",
};

export default function PositionsPanel() {
    const [accounts, setAccounts] = useState([]);
    const [positions, setPositions] = useState([]);
    const [orders, setOrders] = useState([]);
    const [accountStates, setAccountStates] = useState([]);
    const [executions, setExecutions] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState("all");
    const [activeTab, setActiveTab] = useState("positions");
    const [orderFilter, setOrderFilter] = useState("all");
    const [loading, setLoading] = useState(false);
    const [lastRefresh, setLastRefresh] = useState(null);
    const [error, setError] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);

    // ── Data Fetching ──────────────────────────────────────
    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [accs, pos, ords, states] = await Promise.all([
                brokerApi.accounts().catch(() => []),
                brokerApi.allPositions().catch(() => ({ positions: [] })),
                brokerApi.allOrders().catch(() => ({ orders: [] })),
                brokerApi.allStates().catch(() => ({ states: [] })),
            ]);

            setAccounts(Array.isArray(accs) ? accs : []);
            setPositions(pos?.positions || []);
            setOrders(ords?.orders || []);
            setAccountStates(states?.states || []);
            setLastRefresh(new Date());
        } catch (e) {
            setError(e.message);
        }
        setLoading(false);
    }, []);

    // Fetch executions when tab changes
    const fetchExecutions = useCallback(async () => {
        if (activeTab !== "executions") return;
        try {
            if (selectedAccount !== "all" && accounts.length > 0) {
                const execs = await brokerApi.executions(selectedAccount);
                setExecutions(Array.isArray(execs) ? execs : []);
            } else if (accounts.length > 0) {
                // Fetch for first account
                const firstAcc = accounts[0]?.id;
                if (firstAcc) {
                    const execs = await brokerApi.executions(firstAcc);
                    setExecutions(Array.isArray(execs) ? execs : []);
                }
            }
        } catch { setExecutions([]); }
    }, [activeTab, selectedAccount, accounts]);

    useEffect(() => { refresh(); const id = setInterval(refresh, 3000); return () => clearInterval(id); }, [refresh]);
    useEffect(() => { fetchExecutions(); }, [fetchExecutions]);

    // ── Actions ────────────────────────────────────────────
    const handleCancelOrder = async (accountId, orderId) => {
        setActionLoading(orderId);
        try {
            await brokerApi.cancelOrder(accountId, orderId);
            await refresh();
        } catch (e) { alert("Cancel failed: " + e.message); }
        setActionLoading(null);
    };

    const handleClosePosition = async (accountId, positionId) => {
        setActionLoading(positionId);
        try {
            await brokerApi.closePosition(accountId, positionId);
            await refresh();
        } catch (e) { alert("Close failed: " + e.message); }
        setActionLoading(null);
    };

    // ── Filter Helpers ─────────────────────────────────────
    const filteredPositions = selectedAccount === "all"
        ? positions
        : positions.filter(p => p._account_id === selectedAccount);

    const filteredOrders = (() => {
        let ords = selectedAccount === "all"
            ? orders
            : orders.filter(o => o._account_id === selectedAccount);
        if (orderFilter !== "all") {
            ords = ords.filter(o => (o.status || "").toLowerCase() === orderFilter);
        }
        return ords;
    })();

    const orderCounts = {
        all: orders.length,
        working: orders.filter(o => (o.status || "").toLowerCase() === "working").length,
        filled: orders.filter(o => (o.status || "").toLowerCase() === "filled").length,
        rejected: orders.filter(o => ["rejected", "cancelled", "expired"].includes((o.status || "").toLowerCase())).length,
    };

    // ── Account State Cards ────────────────────────────────
    const AccountStateCards = () => (
        <div className="pp-state-grid">
            {accountStates.map((state, i) => {
                const balance = state.balance ?? 0;
                const equity = state.equity ?? 0;
                const upl = state.unrealizedPl ?? 0;
                const amData = state.amData?.[0]?.[0] || [];
                const netLiq = amData[2] ? parseFloat(amData[2]) : equity;
                const totalMargin = amData[3] ? parseFloat(amData[3]) : 0;
                const availMargin = amData[4] ? parseFloat(amData[4]) : 0;

                return (
                    <div key={i} className="pp-state-card">
                        <div className="pp-state-header">
                            <span className="pp-state-name">{state._account_name || state._account_id || "Account"}</span>
                            <span className="pp-state-id">{state._account_id}</span>
                        </div>
                        <div className="pp-state-metrics">
                            <div className="pp-metric">
                                <span className="pp-metric-label">Balance</span>
                                <span className="pp-metric-value">{state._currency_sign || "$"}{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="pp-metric">
                                <span className="pp-metric-label">Equity</span>
                                <span className="pp-metric-value">{state._currency_sign || "$"}{equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="pp-metric">
                                <span className="pp-metric-label">Net Liq</span>
                                <span className="pp-metric-value">{state._currency_sign || "$"}{netLiq.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="pp-metric">
                                <span className="pp-metric-label">Open P/L</span>
                                <span className={`pp-metric-value ${upl >= 0 ? "pp-positive" : "pp-negative"}`}>
                                    {upl >= 0 ? "+" : ""}{state._currency_sign || "$"}{upl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div className="pp-metric">
                                <span className="pp-metric-label">Margin Used</span>
                                <span className="pp-metric-value pp-muted">{state._currency_sign || "$"}{totalMargin.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="pp-metric">
                                <span className="pp-metric-label">Available</span>
                                <span className="pp-metric-value">{state._currency_sign || "$"}{availMargin.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                        {state.error && <div className="pp-state-error">⚠ {state.error}</div>}
                    </div>
                );
            })}
            {accountStates.length === 0 && (
                <div className="pp-empty">No account data available. Check Redis token.</div>
            )}
        </div>
    );

    // ── Positions Table ────────────────────────────────────
    const PositionsTable = () => (
        <div className="pp-table-wrap">
            {filteredPositions.length === 0 ? (
                <div className="pp-empty">
                    <span className="pp-empty-icon">📭</span>
                    <span>No open positions</span>
                </div>
            ) : (
                <table className="pp-table">
                    <thead>
                        <tr>
                            <th>Account</th>
                            <th>ID</th>
                            <th>Symbol</th>
                            <th>Side</th>
                            <th>Raw</th>
                            <th>Qty</th>
                            <th>Avg Price</th>
                            <th>Unrealized P/L</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredPositions.map((pos, i) => {
                            const side = (pos.side || (pos.qty > 0 ? "buy" : "sell")).toLowerCase();
                            const upl = pos.unrealizedPl ?? 0;
                            return (
                                <tr key={i} className={upl >= 0 ? "pp-row-profit" : "pp-row-loss"}>
                                    <td className="pp-cell-account">{pos._account_name || pos._account_id}</td>
                                    <td className="pp-cell-mono pp-cell-dim">{(pos.id || "").toString().slice(-8)}</td>
                                    <td className="pp-cell-symbol">{pos.instrument || "—"}</td>
                                    <td>
                                        <span className="pp-side-badge" style={{ color: SIDE_COLORS[side] || "#fff" }}>
                                            {side === "buy" || side === "long" ? "▲ LONG" : "▼ SHORT"}
                                        </span>
                                    </td>
                                    <td className="pp-cell-dim">{pos.side || "—"}</td>
                                    <td className="pp-cell-mono">{Math.abs(pos.qty || 0)}</td>
                                    <td className="pp-cell-mono">{pos.avgPrice != null ? `$${pos.avgPrice.toFixed(2)}` : "—"}</td>
                                    <td className={`pp-cell-mono ${upl >= 0 ? "pp-positive" : "pp-negative"}`}>
                                        {upl >= 0 ? "+" : ""}${upl.toFixed(2)}
                                    </td>
                                    <td>
                                        <button
                                            className="pp-btn-close"
                                            onClick={() => handleClosePosition(pos._account_id, pos.id)}
                                            disabled={actionLoading === pos.id}
                                        >
                                            {actionLoading === pos.id ? "⏳" : "✕ Close"}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );

    // ── Orders Table ───────────────────────────────────────
    const OrdersTable = () => (
        <div>
            {/* Order filter tabs */}
            <div className="pp-filter-tabs">
                {[
                    { id: "all", label: `All (${orderCounts.all})` },
                    { id: "working", label: `Working (${orderCounts.working})` },
                    { id: "filled", label: `Filled (${orderCounts.filled})` },
                    { id: "rejected", label: `Rejected/Cancelled (${orderCounts.rejected})` },
                ].map(f => (
                    <button
                        key={f.id}
                        className={`pp-filter-btn ${orderFilter === f.id ? "active" : ""}`}
                        onClick={() => setOrderFilter(f.id)}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <div className="pp-table-wrap">
                {filteredOrders.length === 0 ? (
                    <div className="pp-empty">
                        <span className="pp-empty-icon">📋</span>
                        <span>No orders {orderFilter !== "all" ? `with status "${orderFilter}"` : ""}</span>
                    </div>
                ) : (
                    <table className="pp-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Account</th>
                                <th>Symbol</th>
                                <th>Side</th>
                                <th>Qty</th>
                                <th>Type</th>
                                <th>Price</th>
                                <th>Stop</th>
                                <th>Duration</th>
                                <th>Parent</th>
                                <th>Status</th>
                                <th>Time</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrders.map((order, i) => {
                                const status = (order.status || "").toLowerCase();
                                const statusStyle = STATUS_COLORS[status] || STATUS_COLORS.working;
                                const side = (order.side || "").toLowerCase();
                                const duration = order.durationType || order.duration?.type || "—";
                                const parent = order.parentId
                                    ? `${order.parentType || "parent"}:${order.parentId.toString().slice(-6)}`
                                    : "—";
                                const time = order.lastModified
                                    ? new Date(order.lastModified * 1000).toLocaleTimeString()
                                    : "—";

                                return (
                                    <tr key={i}>
                                        <td className="pp-cell-mono pp-cell-dim">{(order.id || "").toString().slice(-8)}</td>
                                        <td className="pp-cell-account">{order._account_name || order._account_id}</td>
                                        <td className="pp-cell-symbol">{order.instrument || "—"}</td>
                                        <td>
                                            <span style={{ color: SIDE_COLORS[side] || "#fff", fontWeight: 700 }}>
                                                {side === "buy" ? "▲ BUY" : "▼ SELL"}
                                            </span>
                                        </td>
                                        <td className="pp-cell-mono">{order.qty || 0}</td>
                                        <td className="pp-cell-type">{(order.type || "market").toUpperCase()}</td>
                                        <td className="pp-cell-mono">
                                            {order.limitPrice != null ? `$${order.limitPrice.toFixed(2)}` :
                                             order.stopPrice != null ? `$${order.stopPrice.toFixed(2)}` : "MKT"}
                                        </td>
                                        <td className="pp-cell-mono">{order.stopPrice != null ? `$${order.stopPrice.toFixed(2)}` : "—"}</td>
                                        <td className="pp-cell-dim">{duration}</td>
                                        <td className="pp-cell-dim">{parent}</td>
                                        <td>
                                            <span className="pp-status-badge" style={{
                                                background: statusStyle.bg,
                                                color: statusStyle.text,
                                                border: `1px solid ${statusStyle.border}`,
                                            }}>
                                                {status === "working" && <span className="pp-pulse" />}
                                                {status.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="pp-cell-dim">{time}</td>
                                        <td>
                                            {status === "working" && (
                                                <button
                                                    className="pp-btn-cancel"
                                                    onClick={() => handleCancelOrder(order._account_id, order.id)}
                                                    disabled={actionLoading === order.id}
                                                >
                                                    {actionLoading === order.id ? "⏳" : "✕ Cancel"}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );

    // ── Executions Table ───────────────────────────────────
    const ExecutionsTable = () => (
        <div className="pp-table-wrap">
            {executions.length === 0 ? (
                <div className="pp-empty">
                    <span className="pp-empty-icon">📜</span>
                    <span>No executions found</span>
                </div>
            ) : (
                <table className="pp-table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Symbol</th>
                            <th>Side</th>
                            <th>Qty</th>
                            <th>Fill Price</th>
                            <th>Order ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        {executions.map((exec, i) => {
                            const side = (exec.side || "").toLowerCase();
                            return (
                                <tr key={i}>
                                    <td className="pp-cell-dim">
                                        {exec.time ? new Date(exec.time * 1000).toLocaleString() : "—"}
                                    </td>
                                    <td className="pp-cell-symbol">{exec.instrument || "—"}</td>
                                    <td>
                                        <span style={{ color: SIDE_COLORS[side] || "#fff", fontWeight: 700 }}>
                                            {side === "buy" ? "▲ BUY" : "▼ SELL"}
                                        </span>
                                    </td>
                                    <td className="pp-cell-mono">{exec.qty || 0}</td>
                                    <td className="pp-cell-mono">${(exec.price || 0).toFixed(2)}</td>
                                    <td className="pp-cell-mono pp-cell-dim">{(exec.id || "").toString().slice(-8)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );

    return (
        <div className="positions-panel">
            {/* Header */}
            <div className="pp-header">
                <div className="pp-header-left">
                    <h2 className="pp-title">📊 Positions & Orders</h2>
                    <div className="pp-meta">
                        {lastRefresh && (
                            <span className="pp-last-refresh">
                                Updated {lastRefresh.toLocaleTimeString()}
                            </span>
                        )}
                        <span className={`pp-status-dot ${loading ? "loading" : error ? "error" : "ok"}`} />
                    </div>
                </div>
                <div className="pp-header-right">
                    <select
                        className="pp-account-select"
                        value={selectedAccount}
                        onChange={(e) => setSelectedAccount(e.target.value)}
                    >
                        <option value="all">All Accounts</option>
                        {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>
                                {acc.name || acc.id}
                            </option>
                        ))}
                    </select>
                    <button className="pp-btn-refresh" onClick={refresh} disabled={loading}>
                        {loading ? "⏳" : "🔄"} Refresh
                    </button>
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="pp-error-banner">
                    ⚠️ {error}
                </div>
            )}

            {/* Account State Cards */}
            <AccountStateCards />

            {/* Tab Navigation */}
            <div className="pp-tabs">
                {[
                    { id: "positions", label: "Positions", icon: "📈", count: filteredPositions.length },
                    { id: "orders", label: "Orders", icon: "📋", count: filteredOrders.length },
                    { id: "executions", label: "Executions", icon: "📜" },
                ].map(tab => (
                    <button
                        key={tab.id}
                        className={`pp-tab ${activeTab === tab.id ? "active" : ""}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <span>{tab.icon}</span>
                        <span>{tab.label}</span>
                        {tab.count != null && <span className="pp-tab-count">{tab.count}</span>}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === "positions" && <PositionsTable />}
            {activeTab === "orders" && <OrdersTable />}
            {activeTab === "executions" && <ExecutionsTable />}
        </div>
    );
}
