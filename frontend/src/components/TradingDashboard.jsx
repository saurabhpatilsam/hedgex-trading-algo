import { useState, useEffect, useCallback, useRef } from "react";
import { tradingApi, marketApi } from "../api";
import TradingPanel from "./TradingPanel";

export default function TradingDashboard() {
    const [strategies, setStrategies] = useState([]);
    const [orders, setOrders] = useState([]);
    const [portfolio, setPortfolio] = useState(null);
    const [alerts, setAlerts] = useState([]);
    const [auditLog, setAuditLog] = useState([]);
    const [runnerStatus, setRunnerStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [killLoading, setKillLoading] = useState(false);
    const [killResult, setKillResult] = useState(null);
    const [killConfirm, setKillConfirm] = useState(false);
    const [activeSection, setActiveSection] = useState("overview");

    // Live price ticker state
    const [livePrices, setLivePrices] = useState({});
    const [mdStatus, setMdStatus] = useState(null);
    const [sseConnected, setSseConnected] = useState(false);
    const [flashSymbol, setFlashSymbol] = useState(null);
    const eventSourceRef = useRef(null);
    const flashTimeoutRef = useRef(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [strats, ords, port, alts, runner] = await Promise.all([
                tradingApi.listStrategies().catch(() => []),
                tradingApi.listOrders(null, null, 50).catch(() => []),
                tradingApi.portfolio().catch(() => null),
                tradingApi.alerts(20).catch(() => []),
                tradingApi.runnerStatus().catch(() => null),
            ]);
            setStrategies(strats);
            setOrders(ords);
            setPortfolio(port);
            setAlerts(alts);
            setRunnerStatus(runner);
        } catch (e) {
            console.error("Refresh failed", e);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        refresh();
        const id = setInterval(refresh, 5000);
        return () => clearInterval(id);
    }, [refresh]);

    const handleKillSwitch = async () => {
        if (!killConfirm) {
            setKillConfirm(true);
            return;
        }
        setKillLoading(true);
        setKillConfirm(false);
        try {
            const result = await tradingApi.killSwitch("Manual: KILL THEM ALL button pressed");
            setKillResult(result);
            await refresh();
        } catch (e) {
            setKillResult({ error: e.message });
        }
        setKillLoading(false);
    };

    const handleDeactivate = async () => {
        try {
            await tradingApi.deactivateKillSwitch();
            setKillResult(null);
            await refresh();
        } catch (e) {
            console.error(e);
        }
    };

    const handleStartStrategy = async (id) => {
        try {
            await tradingApi.startStrategy(id);
            await refresh();
        } catch (e) {
            alert("Start failed: " + e.message);
        }
    };

    const handleStopStrategy = async (id) => {
        try {
            await tradingApi.stopStrategy(id);
            await refresh();
        } catch (e) {
            alert("Stop failed: " + e.message);
        }
    };

    const loadAuditLog = async () => {
        try {
            const log = await tradingApi.auditLog(null, null, 50);
            setAuditLog(log);
            setActiveSection("audit");
        } catch (e) {
            console.error(e);
        }
    };

    const unreadAlerts = alerts.filter((a) => !a.is_read).length;

    // ── Live Price SSE Connection ────────────────────────
    useEffect(() => {
        // Check MD service status
        marketApi.status().then(setMdStatus).catch(() => { });

        const streamUrl = marketApi.streamUrl();
        const es = new EventSource(streamUrl);
        eventSourceRef.current = es;

        es.onopen = () => {
            setSseConnected(true);
        };

        es.addEventListener("snapshot", (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.prices) {
                    setLivePrices(data.prices);
                }
            } catch { }
        });

        es.addEventListener("tick", (e) => {
            try {
                const tick = JSON.parse(e.data);
                if (tick.symbol) {
                    setLivePrices(prev => ({
                        ...prev,
                        [tick.symbol]: tick,
                    }));
                    // Flash effect
                    setFlashSymbol(tick.symbol);
                    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
                    flashTimeoutRef.current = setTimeout(() => setFlashSymbol(null), 300);
                }
            } catch { }
        });

        es.onerror = () => {
            setSseConnected(false);
        };

        // Refresh MD status every 30s
        const statusInterval = setInterval(() => {
            marketApi.status().then(setMdStatus).catch(() => { });
        }, 30000);

        return () => {
            es.close();
            clearInterval(statusInterval);
            if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
        };
    }, []);

    // Fallback: if SSE not working, poll prices every 3s
    useEffect(() => {
        if (sseConnected) return;
        const fallback = setInterval(() => {
            marketApi.prices().then(data => {
                if (data.prices) setLivePrices(data.prices);
            }).catch(() => { });
        }, 3000);
        return () => clearInterval(fallback);
    }, [sseConnected]);

    // ── Instrument Cards Component ──────────────────────
    const FALLBACK_INSTRUMENTS = ['ESH6', 'GCG6', 'MESH6', 'MGCG6', 'MNQH6', 'NQH6'];

    const InstrumentCards = () => {
        // Get all instruments from MD status, livePrices, or fallback
        const mdSymbols = mdStatus?.symbols || [];
        const priceSymbols = Object.keys(livePrices);
        const combined = [...new Set([...mdSymbols, ...priceSymbols])];
        const allSymbols = (combined.length > 0 ? combined : FALLBACK_INSTRUMENTS).sort();

        return (
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: '14px',
                marginBottom: '20px',
            }}>
                {allSymbols.map(symbol => {
                    const tick = livePrices[symbol];
                    const price = tick?.price ?? tick?.bid ?? null;
                    const change = tick?.change ?? 0;
                    const isUp = change > 0;
                    const isDown = change < 0;
                    const isFlashing = flashSymbol === symbol;

                    // Status: green = receiving ticks, yellow = connected but no data, red = disconnected
                    let statusColor, statusGlow, statusLabel;
                    if (price != null) {
                        statusColor = '#22c55e';
                        statusGlow = '0 0 8px #22c55e';
                        statusLabel = 'Live';
                    } else if (mdStatus?.state === 'connected') {
                        statusColor = '#facc15';
                        statusGlow = '0 0 8px #facc15';
                        statusLabel = 'Waiting';
                    } else {
                        statusColor = '#ef4444';
                        statusGlow = '0 0 8px #ef4444';
                        statusLabel = 'Offline';
                    }

                    return (
                        <div key={symbol} style={{
                            padding: '18px 16px',
                            background: isFlashing
                                ? (isUp ? 'rgba(34,197,94,0.12)' : isDown ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.08)')
                                : 'linear-gradient(145deg, rgba(17,24,39,0.95) 0%, rgba(30,41,59,0.9) 100%)',
                            borderRadius: '12px',
                            border: `1px solid ${isFlashing
                                ? (isUp ? 'rgba(34,197,94,0.4)' : isDown ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.2)')
                                : 'rgba(255,255,255,0.06)'}`,
                            transition: 'all 0.2s ease',
                            boxShadow: isFlashing ? '0 0 20px rgba(59,130,246,0.1)' : '0 2px 12px rgba(0,0,0,0.2)',
                        }}>
                            {/* Header: Symbol + Status Dot */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <span style={{
                                    fontSize: '15px', fontWeight: '800', color: '#fff',
                                    letterSpacing: '0.5px',
                                }}>
                                    {symbol}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{
                                        width: '9px', height: '9px', borderRadius: '50%',
                                        background: statusColor, boxShadow: statusGlow,
                                        display: 'inline-block',
                                        animation: price != null ? 'pulse 2s ease-in-out infinite' : 'none',
                                    }} />
                                    <span style={{
                                        fontSize: '10px', fontWeight: '600', color: statusColor,
                                        textTransform: 'uppercase', letterSpacing: '0.5px',
                                    }}>
                                        {statusLabel}
                                    </span>
                                </div>
                            </div>

                            {/* Price */}
                            <div style={{
                                fontSize: '24px', fontWeight: '800', fontFamily: 'monospace',
                                color: price != null ? (isUp ? '#22c55e' : isDown ? '#ef4444' : '#fff') : 'var(--gray-500)',
                                lineHeight: '1.2', marginBottom: '8px',
                                transition: 'color 0.2s',
                            }}>
                                {price != null
                                    ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                    : '—'}
                            </div>

                            {/* Change Badge */}
                            {change !== 0 && (
                                <div style={{ marginBottom: '8px' }}>
                                    <span style={{
                                        fontSize: '11px', fontWeight: '700', fontFamily: 'monospace',
                                        color: isUp ? '#22c55e' : '#ef4444',
                                        background: isUp ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                        padding: '3px 8px', borderRadius: '6px',
                                    }}>
                                        {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(2)}
                                    </span>
                                </div>
                            )}

                            {/* Bid/Ask */}
                            {(tick?.bid || tick?.ask) && (
                                <div style={{
                                    display: 'flex', gap: '8px', fontSize: '11px',
                                    color: 'var(--gray-400)', fontFamily: 'monospace',
                                }}>
                                    {tick.bid && <span>B: {tick.bid.toFixed(2)}</span>}
                                    {tick.ask && <span>A: {tick.ask.toFixed(2)}</span>}
                                </div>
                            )}

                            {/* Volume */}
                            {tick?.volume != null && (
                                <div style={{
                                    fontSize: '11px', color: 'var(--gray-500)', marginTop: '4px',
                                    fontFamily: 'monospace',
                                }}>
                                    Vol: {tick.volume.toLocaleString()}
                                </div>
                            )}

                            {/* No data message */}
                            {price == null && (
                                <div style={{ fontSize: '11px', color: 'var(--gray-600)', marginTop: '4px' }}>
                                    {mdStatus?.state === 'connected'
                                        ? 'Markets closed'
                                        : 'Service offline'}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="trading-dashboard">
            <div className="kill-banner">
                <div className="kill-banner-left">
                    <h2 className="kill-title">⚡ Trading Command Center</h2>
                    <div className="runner-badge">
                        <span className={`runner-dot ${runnerStatus?.running ? "active" : "inactive"}`} />
                        Runner: {runnerStatus?.running ? "ACTIVE" : "STOPPED"}
                        {runnerStatus?.running && ` (${runnerStatus.tick_interval}s)`}
                    </div>
                </div>
                <div className="kill-banner-right">
                    {killResult && !killResult.error && (
                        <button className="btn-deactivate" onClick={handleDeactivate}>
                            🔓 Re-Enable Trading
                        </button>
                    )}
                    <button
                        className={`btn-kill ${killConfirm ? "confirming" : ""}`}
                        onClick={handleKillSwitch}
                        disabled={killLoading}
                    >
                        {killLoading ? (
                            <span className="kill-spinner">⏳ EXECUTING...</span>
                        ) : killConfirm ? (
                            <span className="kill-confirm-text">⚠️ CLICK AGAIN TO CONFIRM</span>
                        ) : (
                            <span>💀 KILL THEM ALL</span>
                        )}
                    </button>
                </div>
            </div>

            {/* Kill result */}
            {killResult && (
                <div className={`kill-result ${killResult.error ? "error" : "success"}`}>
                    {killResult.error ? (
                        <p>❌ Kill switch error: {killResult.error}</p>
                    ) : (
                        <div className="kill-report">
                            <h3>🚨 KILL THEM ALL — Execution Report</h3>
                            <div className="kill-stats">
                                <div className="kill-stat">
                                    <span className="stat-num">{killResult.strategies_stopped}</span>
                                    <span className="stat-label">Strategies Stopped</span>
                                </div>
                                <div className="kill-stat">
                                    <span className="stat-num">{killResult.orders_cancelled}</span>
                                    <span className="stat-label">Internal Orders Cancelled</span>
                                </div>
                                <div className="kill-stat">
                                    <span className="stat-num">{killResult.total_broker_orders_cancelled}</span>
                                    <span className="stat-label">Broker Orders Cancelled</span>
                                </div>
                                <div className="kill-stat">
                                    <span className="stat-num">{killResult.total_positions_flattened}</span>
                                    <span className="stat-label">Positions Flattened</span>
                                </div>
                            </div>
                            {killResult.broker_flatten_reports?.map((r, i) => (
                                <div key={i} className="flatten-account-report">
                                    <strong>📊 {r.account}</strong>
                                    {r.error && <span className="err"> — Error: {r.error}</span>}
                                    {r.orders_cancelled?.length > 0 && (
                                        <span> — {r.orders_cancelled.length} orders cancelled</span>
                                    )}
                                    {r.positions_flattened?.length > 0 && (
                                        <span> — {r.positions_flattened.length} positions closed</span>
                                    )}
                                    {!r.error && !r.orders_cancelled?.length && !r.positions_flattened?.length && (
                                        <span className="flat"> — Already flat ✓</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Live Instrument Cards ───────────────────── */}
            <InstrumentCards />

            {/* ── Trading Panel ──────────────────────────── */}
            <TradingPanel livePrices={livePrices} />

            {/* ── Navigation Tabs ────────────────────────── */}
            <div className="td-tabs">
                {[
                    { id: "overview", label: "Overview", icon: "📊" },
                    { id: "strategies", label: "Strategies", icon: "🎯" },
                    { id: "orders", label: "Orders", icon: "📋" },
                    { id: "alerts", label: `Alerts ${unreadAlerts > 0 ? `(${unreadAlerts})` : ""}`, icon: "🔔" },
                    { id: "audit", label: "Audit Log", icon: "📝" },
                ].map((t) => (
                    <button
                        key={t.id}
                        className={`td-tab ${activeSection === t.id ? "active" : ""}`}
                        onClick={() => {
                            setActiveSection(t.id);
                            if (t.id === "audit") loadAuditLog();
                        }}
                    >
                        <span>{t.icon}</span> {t.label}
                    </button>
                ))}
                <button className="td-tab btn-refresh-sm" onClick={refresh} disabled={loading}>
                    🔄 {loading ? "..." : "Refresh"}
                </button>
            </div>

            {/* ── Overview ────────────────────────────────── */}
            {activeSection === "overview" && (
                <div className="td-section">
                    <div className="portfolio-grid">
                        <div className="portfolio-card">
                            <div className="pc-label">Active Strategies</div>
                            <div className="pc-value">{strategies.filter((s) => s.status === "RUNNING").length}</div>
                            <div className="pc-sub">of {strategies.length} deployed</div>
                        </div>
                        <div className="portfolio-card">
                            <div className="pc-label">Open Positions</div>
                            <div className="pc-value">{portfolio?.total_positions ?? 0}</div>
                            <div className="pc-sub">
                                L: {portfolio?.long_contracts ?? 0} / S: {portfolio?.short_contracts ?? 0}
                            </div>
                        </div>
                        <div className="portfolio-card">
                            <div className="pc-label">Net Exposure</div>
                            <div className="pc-value">{portfolio?.net_exposure ?? 0}</div>
                            <div className="pc-sub">contracts</div>
                        </div>
                        <div className="portfolio-card pnl">
                            <div className="pc-label">Realized P&L</div>
                            <div className={`pc-value ${(portfolio?.realized_pnl ?? 0) >= 0 ? "positive" : "negative"}`}>
                                ${(portfolio?.realized_pnl ?? 0).toFixed(2)}
                            </div>
                            <div className="pc-sub">session total</div>
                        </div>
                    </div>

                    {/* Recent Alerts */}
                    {alerts.length > 0 && (
                        <div className="recent-alerts">
                            <h3>Recent Alerts</h3>
                            {alerts.slice(0, 5).map((a) => (
                                <div key={a.id} className={`alert-item severity-${a.severity.toLowerCase()}`}>
                                    <span className="alert-severity">
                                        {a.severity === "CRITICAL" ? "🚨" : a.severity === "WARNING" ? "⚠️" : "ℹ️"}
                                    </span>
                                    <span className="alert-title">{a.title}</span>
                                    {a.message && <span className="alert-msg">{a.message}</span>}
                                    <span className="alert-time">
                                        {new Date(a.created_at).toLocaleTimeString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Strategies ──────────────────────────────── */}
            {activeSection === "strategies" && (
                <div className="td-section">
                    <h3>Deployed Strategies</h3>
                    {strategies.length === 0 ? (
                        <p className="empty-msg">No strategies deployed yet.</p>
                    ) : (
                        <div className="strategy-list">
                            {strategies.map((s) => (
                                <div key={s.id} className={`strategy-card status-${s.status.toLowerCase()}`}>
                                    <div className="sc-header">
                                        <div>
                                            <h4>{s.name}</h4>
                                            <span className="sc-type">{s.strategy_type}</span>
                                            {s.paper_mode && <span className="sc-paper">📄 PAPER</span>}
                                        </div>
                                        <span className={`sc-badge ${s.status.toLowerCase()}`}>{s.status}</span>
                                    </div>
                                    <div className="sc-params">
                                        {Object.entries(s.parameters || {}).map(([k, v]) => (
                                            <span key={k} className="param-chip">
                                                {k}: {String(v)}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="sc-actions">
                                        {s.status !== "RUNNING" && (
                                            <button className="btn-start" onClick={() => handleStartStrategy(s.id)}>
                                                ▶ Start
                                            </button>
                                        )}
                                        {(s.status === "RUNNING" || s.status === "PAUSED") && (
                                            <button className="btn-stop" onClick={() => handleStopStrategy(s.id)}>
                                                ⏹ Stop
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Orders ──────────────────────────────────── */}
            {activeSection === "orders" && (
                <div className="td-section">
                    <h3>Order Records</h3>
                    {orders.length === 0 ? (
                        <p className="empty-msg">No orders yet.</p>
                    ) : (
                        <div className="orders-table-wrapper">
                            <table className="orders-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Strategy</th>
                                        <th>Side</th>
                                        <th>Qty</th>
                                        <th>Type</th>
                                        <th>State</th>
                                        <th>Fill Price</th>
                                        <th>Broker ID</th>
                                        <th>Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orders.map((o) => (
                                        <tr key={o.id} className={`state-${o.state.toLowerCase()}`}>
                                            <td>{o.id}</td>
                                            <td>{o.strategy_id ?? "—"}</td>
                                            <td className={o.side === "Buy" ? "side-buy" : "side-sell"}>{o.side}</td>
                                            <td>{o.filled_quantity}/{o.quantity}</td>
                                            <td>{o.order_type}</td>
                                            <td><span className={`state-badge ${o.state.toLowerCase()}`}>{o.state}</span></td>
                                            <td>{o.fill_price ? `$${o.fill_price.toFixed(2)}` : "—"}</td>
                                            <td className="broker-id">{o.broker_order_id?.slice(0, 12) ?? "—"}</td>
                                            <td>{new Date(o.created_at).toLocaleTimeString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Alerts ──────────────────────────────────── */}
            {activeSection === "alerts" && (
                <div className="td-section">
                    <div className="section-header">
                        <h3>System Alerts</h3>
                        <button
                            className="btn-mark-read"
                            onClick={async () => {
                                await tradingApi.markAllAlertsRead();
                                refresh();
                            }}
                        >
                            ✓ Mark All Read
                        </button>
                    </div>
                    {alerts.length === 0 ? (
                        <p className="empty-msg">No alerts.</p>
                    ) : (
                        alerts.map((a) => (
                            <div
                                key={a.id}
                                className={`alert-card severity-${a.severity.toLowerCase()} ${a.is_read ? "read" : "unread"}`}
                            >
                                <div className="ac-header">
                                    <span className="ac-icon">
                                        {a.severity === "CRITICAL" ? "🚨" : a.severity === "WARNING" ? "⚠️" : "ℹ️"}
                                    </span>
                                    <span className="ac-title">{a.title}</span>
                                    <span className="ac-time">{new Date(a.created_at).toLocaleString()}</span>
                                </div>
                                {a.message && <div className="ac-message">{a.message}</div>}
                                <div className="ac-meta">
                                    <span className="ac-type">{a.alert_type}</span>
                                    {a.strategy_id && <span>Strategy #{a.strategy_id}</span>}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* ── Audit Log ──────────────────────────────── */}
            {activeSection === "audit" && (
                <div className="td-section">
                    <h3>Audit Trail</h3>
                    {auditLog.length === 0 ? (
                        <p className="empty-msg">No audit entries yet.</p>
                    ) : (
                        <div className="audit-list">
                            {auditLog.map((entry) => (
                                <div key={entry.id} className="audit-entry">
                                    <span className="ae-time">{new Date(entry.timestamp).toLocaleString()}</span>
                                    <span className={`ae-type type-${entry.event_type.toLowerCase().replace(/_/g, "-")}`}>
                                        {entry.event_type}
                                    </span>
                                    <pre className="ae-details">{entry.details_json}</pre>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
