import { useState, useEffect, useCallback } from "react";
import { strategyApi, groupsApi, instrumentsApi } from "../api";

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
            setInstruments(i.filter((x) => x.is_active));
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
    const getInstrumentSymbol = (id) => getInstrument(id)?.symbol || `#${id}`;

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
        const tradeCount = trades.filter ? trades.length : 0;

        return (
            <div key={order.id} className={`order-card order-${order.status.toLowerCase()}`}>
                {/* Top bar: name + status + controls */}
                <div className="order-card-top">
                    <div className="order-info">
                        <span className="order-group">{getGroupName(order.group_id)}</span>
                        <span className="order-sep">→</span>
                        <span className="order-instrument">{getInstrumentSymbol(order.instrument_id)}</span>
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
                        >📋</button>
                    </div>
                </div>

                {/* Parameters grid — always visible */}
                <div className="order-params">
                    <div className="param-item">
                        <span className="param-label">Direction</span>
                        <span className={`param-value ${order.direction === "LONG" ? "val-long" : "val-short"}`}>
                            {order.direction}
                        </span>
                    </div>
                    <div className="param-item">
                        <span className="param-label">Contracts</span>
                        <span className="param-value">{order.quantity}</span>
                    </div>
                    <div className="param-item">
                        <span className="param-label">POT-L TP</span>
                        <span className="param-value ptsl-tp">{order.pot_l_profit_target} ticks</span>
                    </div>
                    <div className="param-item">
                        <span className="param-label">POT-L SL</span>
                        <span className="param-value ptsl-sl">{order.pot_l_stop_loss} ticks</span>
                    </div>
                    <div className="param-item">
                        <span className="param-label">POT-S TP</span>
                        <span className="param-value ptsl-tp">{order.pot_s_profit_target} ticks</span>
                    </div>
                    <div className="param-item">
                        <span className="param-label">POT-S SL</span>
                        <span className="param-value ptsl-sl">{order.pot_s_stop_loss} ticks</span>
                    </div>
                </div>

                {/* Progress bar when executing */}
                {isExecuting && <div className="executing-bar"><div className="executing-fill" /></div>}
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
                        Trades — {getGroupName(orders.find(o => o.id === selectedOrderId)?.group_id)} / {getInstrumentSymbol(orders.find(o => o.id === selectedOrderId)?.instrument_id)}
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
                                                <option key={i.id} value={i.id}>{i.symbol} — {i.exchange}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {editingOrder && (
                                <div className="edit-info-bar">
                                    <span>Group: <strong>{getGroupName(editingOrder.group_id)}</strong></span>
                                    <span>Instrument: <strong>{getInstrumentSymbol(editingOrder.instrument_id)}</strong></span>
                                    <StatusBadge status={editingOrder.status} />
                                </div>
                            )}

                            <div className="form-row">
                                <div className="form-group">
                                    <label>POT-L Direction</label>
                                    <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                                        <option value="LONG">LONG (POT-S → SHORT)</option>
                                        <option value="SHORT">SHORT (POT-S → LONG)</option>
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
                                        <label>POT-L Profit Target (ticks)</label>
                                        <input type="number" step="0.5" min="0" value={form.pot_l_profit_target}
                                            onChange={(e) => {
                                                const v = parseFloat(e.target.value) || 0;
                                                setForm({ ...form, pot_l_profit_target: v, ...(linkPtSl ? { pot_s_stop_loss: v } : {}) });
                                            }}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>POT-L Stop Loss (ticks)</label>
                                        <input type="number" step="0.5" min="0" value={form.pot_l_stop_loss}
                                            onChange={(e) => {
                                                const v = parseFloat(e.target.value) || 0;
                                                setForm({ ...form, pot_l_stop_loss: v, ...(linkPtSl ? { pot_s_profit_target: v } : {}) });
                                            }}
                                        />
                                    </div>
                                </div>

                                {linkPtSl && (
                                    <div className="link-info">
                                        ↔ POT-S Profit Target = <strong>{form.pot_l_stop_loss}</strong> ticks (mirror of POT-L SL)<br />
                                        ↔ POT-S Stop Loss = <strong>{form.pot_l_profit_target}</strong> ticks (mirror of POT-L PT)
                                    </div>
                                )}

                                {!linkPtSl && (
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>POT-S Profit Target (ticks)</label>
                                            <input type="number" step="0.5" min="0"
                                                value={form.pot_s_profit_target ?? form.pot_l_stop_loss}
                                                onChange={(e) => setForm({ ...form, pot_s_profit_target: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>POT-S Stop Loss (ticks)</label>
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
