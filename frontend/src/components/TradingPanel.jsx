import { useState, useEffect, useCallback, useRef } from "react";
import { panelApi, groupsApi, instrumentsApi } from "../api";

/**
 * TradingPanel — Professional order placement panel (NinjaTrader-inspired).
 *
 * Props:
 *   livePrices  — { symbol: { price, bid, ask, change, ... } } from SSE
 */
export default function TradingPanel({ livePrices = {} }) {
    // ── State ──────────────────────────────────────────
    const [groups, setGroups] = useState([]);
    const [instruments, setInstruments] = useState([]);
    const [selectedGroupId, setSelectedGroupId] = useState(null);
    const [selectedInstrument, setSelectedInstrument] = useState(null);
    const [orderType, setOrderType] = useState("Market");
    const [action, setAction] = useState(null); // null until user clicks Buy/Sell
    const [quantity, setQuantity] = useState(1);
    const [price, setPrice] = useState("");
    const [stopPrice, setStopPrice] = useState("");
    const [recentOrders, setRecentOrders] = useState([]);
    const [isPlacing, setIsPlacing] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [lastResult, setLastResult] = useState(null);
    const [error, setError] = useState(null);
    const priceInputRef = useRef(null);

    // ── Load groups & instruments on mount ──────────────
    useEffect(() => {
        groupsApi.list().then(setGroups).catch(console.error);
        instrumentsApi.list().then((data) => {
            setInstruments(data);
            if (data.length > 0) setSelectedInstrument(data[0]);
        }).catch(console.error);
        loadRecentOrders();
    }, []);

    const loadRecentOrders = useCallback(() => {
        panelApi.listOrders(20).then((res) => {
            setRecentOrders(res.orders || []);
        }).catch(console.error);
    }, []);

    // ── Auto-fill price from live data ──────────────────
    useEffect(() => {
        if (!selectedInstrument || orderType === "Market") return;
        const sym = selectedInstrument.contract_month || selectedInstrument.symbol;
        const lp = livePrices[sym];
        if (lp?.price && !price) {
            setPrice(String(lp.price));
        }
    }, [selectedInstrument, livePrices, orderType]);

    // ── Derived data ────────────────────────────────────
    const selectedGroup = groups.find((g) => g.id === selectedGroupId);
    const accountCount = selectedGroup?.members?.length || 0;
    const totalContracts = accountCount * quantity;

    const contractSymbol = selectedInstrument?.contract_month || selectedInstrument?.symbol || "";
    const liveData = livePrices[contractSymbol] || {};
    const currentPrice = liveData.price || null;
    const bid = liveData.bid || currentPrice;
    const ask = liveData.ask || currentPrice;
    const change = liveData.change || 0;

    // ── Order Submission ────────────────────────────────
    const handleOrderClick = (side) => {
        setAction(side);
        setError(null);
        if (!selectedGroupId) {
            setError("Select a group first");
            return;
        }
        if (!selectedInstrument) {
            setError("Select an instrument first");
            return;
        }
        if (orderType !== "Market" && !price) {
            setError("Enter a price for Limit/Stop orders");
            return;
        }
        setShowConfirm(true);
    };

    const confirmOrder = async () => {
        setShowConfirm(false);
        setIsPlacing(true);
        setError(null);
        setLastResult(null);

        try {
            const payload = {
                group_id: selectedGroupId,
                instrument_symbol: selectedInstrument.symbol,
                action: action,
                quantity: quantity,
                order_type: orderType,
            };
            if (orderType !== "Market" && price) {
                payload.price = parseFloat(price);
            }
            if ((orderType === "Stop" || orderType === "StopLimit") && stopPrice) {
                payload.stop_price = parseFloat(stopPrice);
            }

            const result = await panelApi.placeOrder(payload);
            setLastResult(result);
            loadRecentOrders();

            // Auto-clear price for next order
            if (orderType === "Market") {
                setPrice("");
            }
        } catch (err) {
            setError(err.message || "Order failed");
        } finally {
            setIsPlacing(false);
        }
    };

    const cancelOrder = async (brokerOrderId, accountId) => {
        try {
            await panelApi.cancelOrder(parseInt(brokerOrderId), accountId);
            loadRecentOrders();
        } catch (err) {
            setError(err.message || "Cancel failed");
        }
    };

    // ── Format helpers ──────────────────────────────────
    const fmt = (val) => {
        if (val == null) return "—";
        return Number(val).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    const fmtTime = (iso) => {
        if (!iso) return "";
        const d = new Date(iso);
        return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    };

    // ── ORDER TYPE TABS ─────────────────────────────────
    const orderTypes = ["Market", "Limit", "Stop", "StopLimit"];

    return (
        <div className="trading-panel">
            {/* ── Header ────────────────────────────────── */}
            <div className="tp-header">
                <div className="tp-title">
                    <span className="tp-icon">⚡</span>
                    <h3>Trading Panel</h3>
                </div>
                <select
                    className="tp-group-select"
                    value={selectedGroupId || ""}
                    onChange={(e) => setSelectedGroupId(e.target.value ? parseInt(e.target.value) : null)}
                >
                    <option value="">Select Group</option>
                    {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                            {g.name} ({g.members?.length || 0} accts)
                        </option>
                    ))}
                </select>
            </div>

            {/* ── Instrument Row ────────────────────────── */}
            <div className="tp-instrument-row">
                <select
                    className="tp-instrument-select"
                    value={selectedInstrument?.id || ""}
                    onChange={(e) => {
                        const inst = instruments.find((i) => i.id === parseInt(e.target.value));
                        setSelectedInstrument(inst || null);
                        setPrice("");
                        setStopPrice("");
                    }}
                >
                    {instruments.map((inst) => (
                        <option key={inst.id} value={inst.id}>
                            {inst.contract_month || inst.symbol} — {inst.name}
                        </option>
                    ))}
                </select>
                <div className="tp-live-price">
                    <span className="tp-price-label">Last</span>
                    <span className={`tp-price-value ${change > 0 ? "up" : change < 0 ? "down" : ""}`}>
                        {currentPrice ? fmt(currentPrice) : "—"}
                    </span>
                    {change !== 0 && (
                        <span className={`tp-change ${change > 0 ? "up" : "down"}`}>
                            {change > 0 ? "▲" : "▼"} {fmt(Math.abs(change))}
                        </span>
                    )}
                </div>
            </div>

            {/* ── Order Type Tabs ───────────────────────── */}
            <div className="tp-order-types">
                {orderTypes.map((ot) => (
                    <button
                        key={ot}
                        className={`tp-ot-btn ${orderType === ot ? "active" : ""}`}
                        onClick={() => {
                            setOrderType(ot);
                            if (ot === "Market") { setPrice(""); setStopPrice(""); }
                        }}
                    >
                        {ot === "StopLimit" ? "Stop Limit" : ot}
                    </button>
                ))}
            </div>

            {/* ── Quantity & Price Controls ──────────────── */}
            <div className="tp-controls">
                <div className="tp-qty-section">
                    <label>Qty</label>
                    <div className="tp-qty-stepper">
                        <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button>
                        <input
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        />
                        <button onClick={() => setQuantity(quantity + 1)}>+</button>
                    </div>
                </div>

                {orderType !== "Market" && (
                    <div className="tp-price-section">
                        <label>{orderType === "Stop" ? "Stop Price" : "Limit Price"}</label>
                        <div className="tp-price-input-wrap">
                            <span className="tp-currency">$</span>
                            <input
                                ref={priceInputRef}
                                type="number"
                                step="0.25"
                                placeholder={currentPrice ? fmt(currentPrice) : "0.00"}
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                className="tp-price-input"
                            />
                            {currentPrice && (
                                <button
                                    className="tp-price-snap"
                                    onClick={() => setPrice(String(currentPrice))}
                                    title="Use current price"
                                >
                                    ⎔
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {orderType === "StopLimit" && (
                    <div className="tp-price-section">
                        <label>Stop Trigger</label>
                        <div className="tp-price-input-wrap">
                            <span className="tp-currency">$</span>
                            <input
                                type="number"
                                step="0.25"
                                placeholder="0.00"
                                value={stopPrice}
                                onChange={(e) => setStopPrice(e.target.value)}
                                className="tp-price-input"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* ── Buy / Sell Buttons ─────────────────────── */}
            <div className="tp-action-buttons">
                <button
                    className="tp-buy-btn"
                    onClick={() => handleOrderClick("Buy")}
                    disabled={isPlacing || !selectedGroupId}
                >
                    <span className="tp-btn-label">BUY</span>
                    <span className="tp-btn-price">{ask ? fmt(ask) : "—"}</span>
                </button>
                <button
                    className="tp-sell-btn"
                    onClick={() => handleOrderClick("Sell")}
                    disabled={isPlacing || !selectedGroupId}
                >
                    <span className="tp-btn-label">SELL</span>
                    <span className="tp-btn-price">{bid ? fmt(bid) : "—"}</span>
                </button>
            </div>

            {/* ── Order Summary Bar ──────────────────────── */}
            <div className="tp-summary-bar">
                {selectedGroup ? (
                    <>
                        <span className="tp-sum-item">
                            <strong>{accountCount}</strong> accounts
                        </span>
                        <span className="tp-sum-sep">×</span>
                        <span className="tp-sum-item">
                            <strong>{quantity}</strong> contract{quantity > 1 ? "s" : ""}
                        </span>
                        <span className="tp-sum-sep">=</span>
                        <span className="tp-sum-item tp-sum-total">
                            <strong>{totalContracts}</strong> total
                        </span>
                    </>
                ) : (
                    <span className="tp-sum-warn">Select a group to begin trading</span>
                )}
            </div>

            {/* ── Error / Result Banner ──────────────────── */}
            {error && (
                <div className="tp-banner tp-error">
                    <span>⚠️ {error}</span>
                    <button onClick={() => setError(null)}>✕</button>
                </div>
            )}
            {lastResult && (
                <div className={`tp-banner ${lastResult.fail_count === 0 ? "tp-success" : "tp-warning"}`}>
                    <span>
                        {lastResult.action} {lastResult.quantity}x {lastResult.instrument} —
                        ✅ {lastResult.success_count}/{lastResult.total_accounts} filled
                        {lastResult.fail_count > 0 && ` | ❌ ${lastResult.fail_count} failed`}
                    </span>
                    <button onClick={() => setLastResult(null)}>✕</button>
                </div>
            )}

            {/* ── Confirmation Modal ─────────────────────── */}
            {showConfirm && (
                <div className="tp-confirm-overlay" onClick={() => setShowConfirm(false)}>
                    <div className="tp-confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <h4>Confirm Order</h4>
                        <div className="tp-confirm-details">
                            <div className="tp-cd-row">
                                <span>Action</span>
                                <span className={action === "Buy" ? "tp-text-green" : "tp-text-red"}>
                                    {action}
                                </span>
                            </div>
                            <div className="tp-cd-row">
                                <span>Instrument</span>
                                <span>{contractSymbol}</span>
                            </div>
                            <div className="tp-cd-row">
                                <span>Type</span>
                                <span>{orderType}</span>
                            </div>
                            <div className="tp-cd-row">
                                <span>Qty per Account</span>
                                <span>{quantity}</span>
                            </div>
                            {orderType !== "Market" && (
                                <div className="tp-cd-row">
                                    <span>Price</span>
                                    <span>${price}</span>
                                </div>
                            )}
                            {stopPrice && (
                                <div className="tp-cd-row">
                                    <span>Stop Price</span>
                                    <span>${stopPrice}</span>
                                </div>
                            )}
                            <div className="tp-cd-divider" />
                            <div className="tp-cd-row tp-cd-highlight">
                                <span>Group</span>
                                <span>{selectedGroup?.name}</span>
                            </div>
                            <div className="tp-cd-row tp-cd-highlight">
                                <span>Accounts</span>
                                <span>{accountCount}</span>
                            </div>
                            <div className="tp-cd-row tp-cd-highlight">
                                <span>Total Contracts</span>
                                <span className="tp-text-accent">{totalContracts}</span>
                            </div>
                        </div>
                        <div className="tp-confirm-actions">
                            <button className="tp-cancel-btn" onClick={() => setShowConfirm(false)}>
                                Cancel
                            </button>
                            <button
                                className={`tp-execute-btn ${action === "Buy" ? "buy" : "sell"}`}
                                onClick={confirmOrder}
                                disabled={isPlacing}
                            >
                                {isPlacing ? "Placing..." : `${action} ${totalContracts} Contracts`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Recent Orders Table ────────────────────── */}
            <div className="tp-recent">
                <div className="tp-recent-header">
                    <h4>📋 Recent Orders</h4>
                    <button className="tp-refresh-btn" onClick={loadRecentOrders}>↻</button>
                </div>
                {recentOrders.length === 0 ? (
                    <div className="tp-empty">No orders placed yet</div>
                ) : (
                    <div className="tp-orders-table-wrap">
                        <table className="tp-orders-table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Symbol</th>
                                    <th>Side</th>
                                    <th>Qty</th>
                                    <th>Type</th>
                                    <th>Price</th>
                                    <th>Status</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentOrders.map((o) => (
                                    <tr key={o.id}>
                                        <td className="tp-td-time">{fmtTime(o.created_at)}</td>
                                        <td className="tp-td-sym">{o.contract || o.instrument_symbol}</td>
                                        <td className={o.side === "Buy" ? "tp-text-green" : "tp-text-red"}>
                                            {o.side}
                                        </td>
                                        <td>{o.quantity}</td>
                                        <td>{o.order_type}</td>
                                        <td>{o.price ? `$${fmt(o.price)}` : "MKT"}</td>
                                        <td>
                                            <span className={`tp-status-badge ${o.state?.toLowerCase()}`}>
                                                {o.state}
                                            </span>
                                        </td>
                                        <td>
                                            {o.state === "ACCEPTED" && o.broker_order_id && (
                                                <button
                                                    className="tp-cancel-order-btn"
                                                    onClick={() => cancelOrder(o.broker_order_id, o.account_id)}
                                                    title="Cancel order"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
