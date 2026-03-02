import { useState, useEffect, useCallback } from "react";
import { strategyApi, groupsApi, instrumentsApi, usersApi } from "../api";

export default function StrategyPanel() {
    const [groups, setGroups] = useState([]);
    const [instruments, setInstruments] = useState([]);
    const [orders, setOrders] = useState([]);
    const [trades, setTrades] = useState([]);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null); // null = create new
    const [selectedOrderId, setSelectedOrderId] = useState(null);
    const [linkPtSl, setLinkPtSl] = useState(true);
    const [executing, setExecuting] = useState({}); // { orderId: true } while placing

    // Instrument inline add
    const [showAddInst, setShowAddInst] = useState(false);
    const [newInstSymbol, setNewInstSymbol] = useState("");
    const [newInstName, setNewInstName] = useState("");

    const emptyForm = {
        group_id: "",
        instrument_id: "",
        direction: "LONG",
        quantity: 1,
        pot_l_profit_target: 20,
        pot_l_stop_loss: 10,
        pot_s_profit_target: null,
        pot_s_stop_loss: null,
    };
    const [form, setForm] = useState(emptyForm);

    const load = useCallback(async () => {
        try {
            const [g, i, o] = await Promise.all([
                groupsApi.list(), instrumentsApi.list(), strategyApi.orders(),
            ]);
            setGroups(g);
            setInstruments(i);
            setOrders(o);
        } catch (e) {
            setError(e.message);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!selectedOrderId) { setTrades([]); return; }
        strategyApi.trades(50, selectedOrderId).then(setTrades).catch(() => { });
    }, [selectedOrderId]);

    // ── Instrument Inline CRUD ───────────────────────────
    const handleAddInstrument = async (e) => {
        e.preventDefault();
        if (!newInstSymbol.trim()) return;
        setError("");
        try {
            await instrumentsApi.create({
                symbol: newInstSymbol.trim().toUpperCase(),
                name: newInstName.trim(),
            });
            setNewInstSymbol("");
            setNewInstName("");
            setShowAddInst(false);
            setSuccess(`Instrument ${newInstSymbol.toUpperCase()} added`);
            load();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDeleteInstrument = async (id, symbol) => {
        if (!confirm(`Delete instrument ${symbol}?`)) return;
        try {
            await instrumentsApi.delete(id);
            load();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleSyncInstruments = async () => {
        clearAlerts();
        try {
            const users = await usersApi.list();
            if (!users || users.length === 0) {
                setError("No users found to sync instruments.");
                return;
            }
            // Pick the first user that has broker credentials (e.g. Suraj)
            const userWithCreds = users.find(u => u.credentials && u.credentials.length > 0);
            if (!userWithCreds) {
                setError("No user with broker credentials found. Add credentials first.");
                return;
            }
            const res = await instrumentsApi.sync(userWithCreds.id);
            setSuccess(res.message || "Instruments synced successfully.");
            load();
        } catch (err) {
            setError(err.message);
        }
    };

    // ── Actions ──────────────────────────────────────────
    const clearAlerts = () => { setError(""); setSuccess(""); };

    const openCreateModal = () => {
        setEditingOrder(null);
        setForm(emptyForm);
        setLinkPtSl(true);
        clearAlerts();
        setShowModal(true);
    };

    const openEditModal = (order) => {
        setEditingOrder(order);
        setForm({
            group_id: String(order.group_id),
            instrument_id: String(order.instrument_id),
            direction: order.direction,
            quantity: order.quantity,
            pot_l_profit_target: order.pot_l_profit_target,
            pot_l_stop_loss: order.pot_l_stop_loss,
            pot_s_profit_target: order.pot_s_profit_target,
            pot_s_stop_loss: order.pot_s_stop_loss,
        });
        // Check if PTSL is mirrored
        setLinkPtSl(
            order.pot_s_profit_target === order.pot_l_stop_loss &&
            order.pot_s_stop_loss === order.pot_l_profit_target
        );
        clearAlerts();
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        clearAlerts();
        try {
            if (editingOrder) {
                // Edit existing
                const payload = {
                    direction: form.direction,
                    quantity: form.quantity,
                    pot_l_profit_target: form.pot_l_profit_target,
                    pot_l_stop_loss: form.pot_l_stop_loss,
                    pot_s_profit_target: linkPtSl ? form.pot_l_stop_loss : (form.pot_s_profit_target ?? form.pot_l_stop_loss),
                    pot_s_stop_loss: linkPtSl ? form.pot_l_profit_target : (form.pot_s_stop_loss ?? form.pot_l_profit_target),
                };
                await strategyApi.edit(editingOrder.id, payload);
                setSuccess(`Strategy #${editingOrder.id} updated`);
            } else {
                // Create new
                const payload = {
                    group_id: parseInt(form.group_id),
                    instrument_id: parseInt(form.instrument_id),
                    direction: form.direction,
                    quantity: form.quantity,
                    pot_l_profit_target: form.pot_l_profit_target,
                    pot_l_stop_loss: form.pot_l_stop_loss,
                };
                if (!linkPtSl) {
                    payload.pot_s_profit_target = form.pot_s_profit_target;
                    payload.pot_s_stop_loss = form.pot_s_stop_loss;
                }
                const order = await strategyApi.start(payload);
                setSuccess(`Strategy started! Order #${order.id}`);
                setSelectedOrderId(order.id);
            }
            setShowModal(false);
            load();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleAction = async (action, orderId) => {
        clearAlerts();
        try {
            const fn = { stop: strategyApi.stop, pause: strategyApi.pause, resume: strategyApi.resume, disable: strategyApi.disable, enable: strategyApi.enable };
            await fn[action](orderId);
            const labels = { stop: "Stopped", pause: "Paused", resume: "Resumed", disable: "Disabled", enable: "Enabled" };
            setSuccess(`Strategy #${orderId} ${labels[action]}`);
            load();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleExecute = async (orderId) => {
        clearAlerts();
        setExecuting((prev) => ({ ...prev, [orderId]: true }));
        try {
            const result = await strategyApi.execute(orderId);
            setSuccess(result.message);
            const t = await strategyApi.trades(50, orderId);
            setTrades(t);
            load();
        } catch (err) {
            setError(err.message);
        } finally {
            setExecuting((prev) => ({ ...prev, [orderId]: false }));
        }
    };

    // ── Helpers ──────────────────────────────────────────
    const getGroupName = (id) => groups.find((g) => g.id === id)?.name || `#${id}`;
    const getInstrument = (id) => instruments.find((i) => i.id === id);
    const getInstrumentLabel = (id) => {
        const inst = getInstrument(id);
        if (!inst) return `#${id}`;
        return inst.name ? `${inst.symbol} — ${inst.name}` : inst.symbol;
    };

    const activeOrders = orders.filter((o) => o.status === "RUNNING" || o.status === "PAUSED");
    const stoppedOrders = orders.filter((o) => o.status === "STOPPED");
    const disabledOrders = orders.filter((o) => o.status === "DISABLED");

    // ── Status badge helper ──────────────────────────────
    const StatusBadge = ({ status }) => {
        const cls = {
            RUNNING: "badge-running",
            PAUSED: "badge-paused",
            STOPPED: "badge-stopped",
            DISABLED: "badge-disabled",
            IDLE: "badge-stopped",
        };
        return <span className={`status-badge ${cls[status] || ""}`}>{status}</span>;
    };

    // ── Render an order card (fully expanded) ────────────
    const renderOrderCard = (order) => {
        const isRunning = order.status === "RUNNING";
        const isPaused = order.status === "PAUSED";
        const isStopped = order.status === "STOPPED";
        const isDisabled = order.status === "DISABLED";
        const isExecuting = executing[order.id];

        const group = groups.find((g) => g.id === order.group_id);
        const longAccounts = (group?.members || []).filter(m => m.side === "LONG");
        const shortAccounts = (group?.members || []).filter(m => m.side === "SHORT");
        const instrument = getInstrument(order.instrument_id);

        const isPrimaryLong = order.direction === "LONG";
        const p_tp = order.pot_l_profit_target;
        const p_sl = order.pot_l_stop_loss;
        const s_tp = order.pot_s_profit_target ?? p_sl;
        const s_sl = order.pot_s_stop_loss ?? p_tp;

        const longTp = isPrimaryLong ? p_tp : s_tp;
        const longSl = isPrimaryLong ? p_sl : s_sl;
        const shortTp = isPrimaryLong ? s_tp : p_tp;
        const shortSl = isPrimaryLong ? s_sl : p_sl;

        return (
            <div key={order.id} className={`order-card order-${order.status.toLowerCase()}`}>
                {/* Top bar: name + status + controls */}
                <div className="order-card-top" style={{ flexWrap: 'wrap', gap: '10px' }}>
                    <div className="order-info" style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <span className="order-group" style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--gray-100)' }}>
                            {group?.name || `#${order.group_id}`}
                        </span>
                        <span className="order-sep" style={{ color: 'var(--gray-500)' }}>|</span>
                        <span className="order-instrument" style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--accent-1)', background: 'rgba(139, 92, 246, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                            {instrument?.symbol || `#${order.instrument_id}`}
                        </span>
                        <span className="order-instrument" style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
                            ({order.quantity} Contract{order.quantity !== 1 ? 's' : ''}, Primary is {order.direction})
                        </span>
                        <StatusBadge status={order.status} />
                        {isExecuting && <span className="executing-badge">⏳ Placing Orders…</span>}
                    </div>
                    <div className="order-controls">
                        {isRunning && (
                            <>
                                <button className="btn btn-sm btn-execute" onClick={() => handleExecute(order.id)} disabled={isExecuting}>
                                    {isExecuting ? "⏳ Placing…" : "▶ Execute"}
                                </button>
                                <button className="btn btn-sm btn-pause" onClick={() => handleAction("pause", order.id)}>⏸ Pause</button>
                                <button className="btn btn-sm btn-stop-sm" onClick={() => handleAction("stop", order.id)}>■ Stop</button>
                            </>
                        )}
                        {isPaused && (
                            <>
                                <button className="btn btn-sm btn-resume" onClick={() => handleAction("resume", order.id)}>▶ Resume</button>
                                <button className="btn btn-sm btn-stop-sm" onClick={() => handleAction("stop", order.id)}>■ Stop</button>
                            </>
                        )}
                        {isStopped && (
                            <>
                                <button className="btn btn-sm btn-resume" onClick={() => handleAction("resume", order.id)}>▶ Restart</button>
                                <button className="btn btn-sm btn-disable" onClick={() => handleAction("disable", order.id)}>⊘ Disable</button>
                            </>
                        )}
                        {isDisabled && (
                            <button className="btn btn-sm btn-resume" onClick={() => handleAction("enable", order.id)}>↩ Enable</button>
                        )}
                        <button className="btn btn-sm btn-edit" onClick={() => openEditModal(order)}>✏️ Edit</button>
                        <button
                            className={`btn btn-sm ${selectedOrderId === order.id ? "btn-selected" : ""}`}
                            onClick={() => setSelectedOrderId(selectedOrderId === order.id ? null : order.id)}
                            title="View Trades"
                        >📋</button>
                    </div>
                </div>

                {/* Strategy Details Layout */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '16px', padding: '16px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>

                    {/* LONG SIDE INFO */}
                    <div style={{ flex: '1 1 300px', padding: '12px', background: 'rgba(34, 197, 94, 0.05)', borderLeft: '3px solid #22c55e', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📈 Long Side {isPrimaryLong ? "(Primary)" : "(Hedge)"}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ fontSize: '13px' }}>
                                <span style={{ color: 'var(--gray-400)', marginRight: '8px' }}>Accounts:</span>
                                {longAccounts.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                        {longAccounts.map(a => (
                                            <span key={a.id} style={{ color: 'var(--gray-200)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', width: 'fit-content' }}>
                                                👤 {a.account_name}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <span style={{ color: 'var(--gray-500)', fontStyle: 'italic' }}>None configured</span>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                                <div>
                                    <span style={{ color: 'var(--gray-400)', fontSize: '12px', display: 'block', marginBottom: '2px' }}>Take Profit</span>
                                    <span style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '14px', background: 'rgba(34,197,94,0.1)', padding: '2px 8px', borderRadius: '4px' }}>+{longTp} ticks</span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--gray-400)', fontSize: '12px', display: 'block', marginBottom: '2px' }}>Stop Loss</span>
                                    <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '14px', background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: '4px' }}>-{longSl} ticks</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SHORT SIDE INFO */}
                    <div style={{ flex: '1 1 300px', padding: '12px', background: 'rgba(239, 68, 68, 0.05)', borderLeft: '3px solid #ef4444', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📉 Short Side {!isPrimaryLong ? "(Primary)" : "(Hedge)"}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ fontSize: '13px' }}>
                                <span style={{ color: 'var(--gray-400)', marginRight: '8px' }}>Accounts:</span>
                                {shortAccounts.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                        {shortAccounts.map(a => (
                                            <span key={a.id} style={{ color: 'var(--gray-200)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', width: 'fit-content' }}>
                                                👤 {a.account_name}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <span style={{ color: 'var(--gray-500)', fontStyle: 'italic' }}>None configured</span>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                                <div>
                                    <span style={{ color: 'var(--gray-400)', fontSize: '12px', display: 'block', marginBottom: '2px' }}>Take Profit</span>
                                    <span style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '14px', background: 'rgba(34,197,94,0.1)', padding: '2px 8px', borderRadius: '4px' }}>+{shortTp} ticks</span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--gray-400)', fontSize: '12px', display: 'block', marginBottom: '2px' }}>Stop Loss</span>
                                    <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '14px', background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: '4px' }}>-{shortSl} ticks</span>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Progress bar when executing */}
                {isExecuting && <div className="executing-bar" style={{ marginTop: '16px' }}><div className="executing-fill" /></div>}
            </div>
        );
    };

    return (
        <div className="manager-page">
            <div className="page-header">
                <h2>Strategy Control</h2>
                <button className="btn btn-primary" onClick={openCreateModal}>
                    ⚡ New Strategy
                </button>
            </div>

            {error && <div className="error-banner">{error}</div>}
            {success && <div className="success-banner">{success}</div>}

            {/* ── Instruments Section (inline) ─────────────── */}
            <div className="instruments-inline-section">
                <div className="instruments-inline-header">
                    <h4>Instruments</h4>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-sm btn-outline" onClick={handleSyncInstruments} title="Fetch active contracts from Tradovate">
                            🔄 Auto Sync
                        </button>
                        {!showAddInst && (
                            <button className="btn btn-sm btn-primary" onClick={() => { setShowAddInst(true); setError(""); }}>
                                + Add
                            </button>
                        )}
                    </div>
                </div>

                {showAddInst && (
                    <form onSubmit={handleAddInstrument} className="inst-add-form">
                        <input
                            type="text"
                            value={newInstSymbol}
                            onChange={(e) => setNewInstSymbol(e.target.value.toUpperCase())}
                            placeholder="Symbol (e.g. ES)"
                            required
                            autoFocus
                        />
                        <input
                            type="text"
                            value={newInstName}
                            onChange={(e) => setNewInstName(e.target.value)}
                            placeholder="Name (e.g. E-mini S&P 500)"
                        />
                        <button type="submit" className="btn btn-sm btn-primary">Add</button>
                        <button type="button" className="btn btn-sm btn-cancel" onClick={() => setShowAddInst(false)}>Cancel</button>
                    </form>
                )}

                <div className="inst-chips">
                    {instruments.length === 0 && !showAddInst && (
                        <div className="zone-empty" style={{ padding: "12px" }}>
                            No instruments yet. Add one to create strategies.
                        </div>
                    )}
                    {instruments.map((inst) => (
                        <div key={inst.id} className="inst-chip">
                            <span className="inst-chip-symbol">{inst.symbol}</span>
                            {inst.name && <span className="inst-chip-name">{inst.name}</span>}
                            <button
                                className="chip-btn chip-btn-del"
                                onClick={() => handleDeleteInstrument(inst.id, inst.symbol)}
                                title="Delete instrument"
                            >✕</button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Active Strategies */}
            <div className="strat-section">
                <h3 className="section-title">Active ({activeOrders.length})</h3>
                {activeOrders.length === 0 && (
                    <div className="zone-empty">No active strategies. Create one to get started.</div>
                )}
                {activeOrders.map(renderOrderCard)}
            </div>

            {/* Trade Log */}
            {selectedOrderId && (
                <div className="strat-section">
                    <h3 className="section-title">
                        Trades — {getGroupName(orders.find(o => o.id === selectedOrderId)?.group_id)} / {getInstrument(orders.find(o => o.id === selectedOrderId)?.instrument_id)?.symbol}
                    </h3>
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Account</th>
                                    <th>Side</th>
                                    <th>Qty</th>
                                    <th>Price</th>
                                    <th>TP</th>
                                    <th>SL</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trades.length === 0 && (
                                    <tr><td colSpan="8" className="empty-state">No trades yet. Execute the strategy.</td></tr>
                                )}
                                {trades.map((t) => {
                                    const member = groups.flatMap(g => g.members || []).find(m => m.account_id === t.account_id);
                                    return (
                                        <tr key={t.id}>
                                            <td className="time-cell">{new Date(t.timestamp).toLocaleTimeString()}</td>
                                            <td>{member?.account_name || `#${t.account_id}`}</td>
                                            <td><span className={`badge ${t.side === "LONG" ? "badge-long" : "badge-short"}`}>{t.side}</span></td>
                                            <td>{t.quantity}</td>
                                            <td>${t.entry_price.toFixed(2)}</td>
                                            <td className="ptsl-tp">{t.profit_target ?? "—"}</td>
                                            <td className="ptsl-sl">{t.stop_loss ?? "—"}</td>
                                            <td><span className="badge badge-neutral">{t.status}</span></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Stopped */}
            {stoppedOrders.length > 0 && (
                <div className="strat-section">
                    <h3 className="section-title">Stopped ({stoppedOrders.length})</h3>
                    {stoppedOrders.map(renderOrderCard)}
                </div>
            )}

            {/* Disabled */}
            {disabledOrders.length > 0 && (
                <div className="strat-section">
                    <h3 className="section-title">Disabled ({disabledOrders.length})</h3>
                    {disabledOrders.map(renderOrderCard)}
                </div>
            )}

            {/* ── Create / Edit Modal ─────────────────────────── */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingOrder ? `Edit Strategy #${editingOrder.id}` : "Start New Strategy"}</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-form">
                            {/* Group + Instrument (only for new) */}
                            {!editingOrder && (
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Group</label>
                                        <select value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })} required>
                                            <option value="">Select group...</option>
                                            {groups.map((g) => (
                                                <option key={g.id} value={g.id}>{g.name} ({(g.members || []).length} accounts)</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Instrument</label>
                                        <select value={form.instrument_id} onChange={(e) => setForm({ ...form, instrument_id: e.target.value })} required>
                                            <option value="">Select instrument...</option>
                                            {instruments.map((i) => (
                                                <option key={i.id} value={i.id}>{i.symbol}{i.name ? ` — ${i.name}` : ""}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {editingOrder && (
                                <div className="edit-info-bar">
                                    <span>Group: <strong>{getGroupName(editingOrder.group_id)}</strong></span>
                                    <span>Instrument: <strong>{getInstrument(editingOrder.instrument_id)?.symbol || `#${editingOrder.instrument_id}`}</strong></span>
                                    <StatusBadge status={editingOrder.status} />
                                </div>
                            )}

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Primary Direction</label>
                                    <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                                        <option value="LONG">LONG (Primary is Long, Hedge is Short)</option>
                                        <option value="SHORT">SHORT (Primary is Short, Hedge is Long)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Quantity (contracts)</label>
                                    <input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 1 })} />
                                </div>
                            </div>

                            <div className="ptsl-config">
                                <div className="ptsl-config-header">
                                    <h4>Profit Target & Stop Loss</h4>
                                    <label className="link-toggle">
                                        <input type="checkbox" checked={linkPtSl} onChange={(e) => setLinkPtSl(e.target.checked)} />
                                        <span>Mirror PT↔SL</span>
                                    </label>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label>{form.direction === "LONG" ? "📈 Long Side (Primary)" : "📉 Short Side (Primary)"} Take Profit (ticks)</label>
                                        <input type="number" step="0.5" min="0" value={form.pot_l_profit_target}
                                            onChange={(e) => {
                                                const v = parseFloat(e.target.value) || 0;
                                                setForm({ ...form, pot_l_profit_target: v, ...(linkPtSl ? { pot_s_stop_loss: v } : {}) });
                                            }}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>{form.direction === "LONG" ? "📈 Long Side (Primary)" : "📉 Short Side (Primary)"} Stop Loss (ticks)</label>
                                        <input type="number" step="0.5" min="0" value={form.pot_l_stop_loss}
                                            onChange={(e) => {
                                                const v = parseFloat(e.target.value) || 0;
                                                setForm({ ...form, pot_l_stop_loss: v, ...(linkPtSl ? { pot_s_profit_target: v } : {}) });
                                            }}
                                        />
                                    </div>
                                </div>

                                {linkPtSl && (
                                    <div className="link-info" style={{ marginTop: '8px', padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderLeft: '3px solid #3b82f6', borderRadius: '4px' }}>
                                        ↔ {form.direction === "LONG" ? "Short Side (Hedge)" : "Long Side (Hedge)"} Take Profit = <strong>{form.pot_l_stop_loss}</strong> ticks (mirrored)<br />
                                        ↔ {form.direction === "LONG" ? "Short Side (Hedge)" : "Long Side (Hedge)"} Stop Loss = <strong>{form.pot_l_profit_target}</strong> ticks (mirrored)
                                    </div>
                                )}

                                {!linkPtSl && (
                                    <div className="form-row" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div className="form-group">
                                            <label>{form.direction === "LONG" ? "📉 Short Side (Hedge)" : "📈 Long Side (Hedge)"} Take Profit (ticks)</label>
                                            <input type="number" step="0.5" min="0"
                                                value={form.pot_s_profit_target ?? form.pot_l_stop_loss}
                                                onChange={(e) => setForm({ ...form, pot_s_profit_target: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>{form.direction === "LONG" ? "📉 Short Side (Hedge)" : "📈 Long Side (Hedge)"} Stop Loss (ticks)</label>
                                            <input type="number" step="0.5" min="0"
                                                value={form.pot_s_stop_loss ?? form.pot_l_profit_target}
                                                onChange={(e) => setForm({ ...form, pot_s_stop_loss: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">
                                    {editingOrder ? "💾 Save Changes" : "⚡ Start Strategy"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
