import { useState, useEffect, useCallback, useRef } from "react";
import { panelApi, groupsApi, instrumentsApi, accountsApi, usersApi, marketApi } from "../api";

/**
 * TradingPanel V2 — Professional order placement panel (NinjaTrader-inspired).
 *
 * Props:
 *   livePrices  — { symbol: { price, bid, ask, change, ... } } from SSE
 */
export default function TradingPanel({ livePrices = {} }) {
    // ── Data State ──────────────────────────────────────
    const [groups, setGroups] = useState([]);
    const [instruments, setInstruments] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [users, setUsers] = useState([]);

    // ── Selection State ─────────────────────────────────
    const [tradingMode, setTradingMode] = useState("group"); // "group" | "account"
    const [selectedGroupId, setSelectedGroupId] = useState(null);
    const [selectedAccountIds, setSelectedAccountIds] = useState([]);
    const [selectedInstrument, setSelectedInstrument] = useState(null);

    // ── Order State ─────────────────────────────────────
    const [orderType, setOrderType] = useState("Market");
    const [action, setAction] = useState(null);
    const [quantity, setQuantity] = useState(1);
    const [price, setPrice] = useState("");
    const [stopPrice, setStopPrice] = useState("");

    // ── UI State ────────────────────────────────────────
    const [recentOrders, setRecentOrders] = useState([]);
    const [isPlacing, setIsPlacing] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [skipConfirmation, setSkipConfirmation] = useState(true);
    const [lastResult, setLastResult] = useState(null);
    const [error, setError] = useState(null);
    const [priceFlash, setPriceFlash] = useState(false);
    const priceInputRef = useRef(null);
    const stopInputRef = useRef(null);
    const flashRef = useRef(null);

    // ── Load Data on Mount ──────────────────────────────
    useEffect(() => {
        groupsApi.list().then(setGroups).catch(console.error);
        instrumentsApi.list().then((data) => {
            setInstruments(data);
            if (data.length > 0) setSelectedInstrument(data[0]);
        }).catch(console.error);
        accountsApi.list().then(setAccounts).catch(console.error);
        usersApi.list().then(setUsers).catch(console.error);
        loadRecentOrders();
    }, []);

    const loadRecentOrders = useCallback(() => {
        panelApi.listOrders(30).then((res) => {
            setRecentOrders(res.orders || []);
        }).catch(console.error);
    }, []);

    // ── Derived Data ────────────────────────────────────
    const selectedGroup = groups.find((g) => g.id === selectedGroupId);
    const groupMembers = selectedGroup?.members || [];
    const accountCount = tradingMode === "group" ? groupMembers.length : selectedAccountIds.length;
    const totalContracts = accountCount * quantity;

    const contractSymbol = selectedInstrument?.contract_month || selectedInstrument?.symbol || "";

    // ── Direct price polling fallback ────────────────────
    const [fallbackPrice, setFallbackPrice] = useState(null);
    const fallbackRef = useRef(null);

    useEffect(() => {
        // If SSE provides no data for this symbol, poll Tradovate directly
        const sseHasData = livePrices[contractSymbol]?.price != null;
        if (sseHasData || !contractSymbol) {
            // SSE is working, clear any fallback interval
            if (fallbackRef.current) {
                clearInterval(fallbackRef.current);
                fallbackRef.current = null;
            }
            return;
        }

        // Start polling
        const poll = () => {
            marketApi.liveQuote(contractSymbol).then(data => {
                if (data?.price != null) {
                    setFallbackPrice(data);
                }
            }).catch(() => { });
        };
        poll(); // Immediate first call
        fallbackRef.current = setInterval(poll, 5000);

        return () => {
            if (fallbackRef.current) {
                clearInterval(fallbackRef.current);
                fallbackRef.current = null;
            }
        };
    }, [contractSymbol, livePrices[contractSymbol]?.price]);

    const liveData = livePrices[contractSymbol] || (fallbackPrice?.symbol === contractSymbol ? fallbackPrice : {});
    const currentPrice = liveData.price || null;
    const bid = liveData.bid || currentPrice;
    const ask = liveData.ask || currentPrice;
    const change = liveData.change || 0;

    // Group accounts by user for account dropdown
    const accountsByUser = users.map((u) => ({
        user: u,
        accounts: accounts.filter((a) => a.user_id === u.id),
    })).filter((g) => g.accounts.length > 0);

    // ── Price flash effect on tick ───────────────────────
    const prevPriceRef = useRef(currentPrice);
    useEffect(() => {
        if (currentPrice && currentPrice !== prevPriceRef.current) {
            setPriceFlash(true);
            if (flashRef.current) clearTimeout(flashRef.current);
            flashRef.current = setTimeout(() => setPriceFlash(false), 300);
            prevPriceRef.current = currentPrice;
        }
    }, [currentPrice]);

    // ── Click-to-fill price handler ─────────────────────
    const handlePriceClick = () => {
        if (!currentPrice) return;
        if (orderType === "Limit" || orderType === "StopLimit") {
            setPrice(String(currentPrice));
            priceInputRef.current?.focus();
        }
        if (orderType === "Stop") {
            setStopPrice(String(currentPrice));
            stopInputRef.current?.focus();
        }
        if (orderType === "StopLimit") {
            // For StopLimit, also fill stop if empty
            if (!stopPrice) setStopPrice(String(currentPrice));
        }
    };

    // ── Mode switching ──────────────────────────────────
    const switchToGroup = (groupId) => {
        setTradingMode("group");
        setSelectedGroupId(groupId ? parseInt(groupId) : null);
        setSelectedAccountIds([]);
    };

    const switchToAccount = (accountId) => {
        setTradingMode("account");
        setSelectedGroupId(null);
        if (!accountId) return;
        const id = parseInt(accountId);
        if (!selectedAccountIds.includes(id)) {
            setSelectedAccountIds([...selectedAccountIds, id]);
        }
    };

    const removeAccount = (accountId) => {
        setSelectedAccountIds(selectedAccountIds.filter(id => id !== accountId));
    };

    // ── Order Submission ────────────────────────────────
    const canTrade = tradingMode === "group" ? !!selectedGroupId : selectedAccountIds.length > 0;

    const handleOrderClick = (side) => {
        setAction(side);
        setError(null);
        if (!canTrade) {
            setError(tradingMode === "group" ? "Select a group first" : "Select an account first");
            return;
        }
        if (!selectedInstrument) {
            setError("Select an instrument first");
            return;
        }
        if ((orderType === "Limit" || orderType === "StopLimit") && !price) {
            setError("Enter a limit price");
            return;
        }
        if ((orderType === "Stop" || orderType === "StopLimit") && !stopPrice) {
            setError("Enter a stop price");
            return;
        }

        if (skipConfirmation) {
            confirmOrder(side);
        } else {
            setShowConfirm(true);
        }
    };

    const confirmOrder = async (sideOverride) => {
        const orderSide = sideOverride || action;
        setShowConfirm(false);
        setIsPlacing(true);
        setError(null);
        setLastResult(null);

        try {
            const payload = {
                instrument_symbol: selectedInstrument.symbol,
                action: orderSide,
                quantity: quantity,
                order_type: orderType,
            };

            if (tradingMode === "group") {
                payload.group_id = selectedGroupId;
            } else {
                payload.account_ids = selectedAccountIds;
            }

            if (orderType !== "Market" && price) {
                payload.price = parseFloat(price);
            }
            if ((orderType === "Stop" || orderType === "StopLimit") && stopPrice) {
                payload.stop_price = parseFloat(stopPrice);
            }

            const result = await panelApi.placeOrder(payload);
            setLastResult(result);
            loadRecentOrders(); // auto-refresh

            if (orderType === "Market") setPrice("");
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

    // ── Positions & Flatten handlers ────────────────────
    const [positions, setPositions] = useState([]);
    const [ordersTab, setOrdersTab] = useState("live"); // "live" | "history"
    const [flatteningId, setFlatteningId] = useState(null);

    const loadPositions = useCallback(() => {
        panelApi.positions().then(res => {
            setPositions(res.positions || []);
        }).catch(console.error);
    }, []);

    // Auto-refresh live orders + positions every 5s
    useEffect(() => {
        loadPositions();
        const interval = setInterval(() => {
            loadRecentOrders();
            loadPositions();
        }, 5000);
        return () => clearInterval(interval);
    }, [loadPositions, loadRecentOrders]);

    const handleFlatten = async (accountId) => {
        if (!window.confirm("⚠️ This will cancel all working orders and close all positions for this account. Continue?")) return;
        setFlatteningId(accountId);
        try {
            await panelApi.flatten(accountId);
            loadPositions();
            loadRecentOrders();
        } catch (err) {
            setError(err.message || "Flatten failed");
        } finally {
            setFlatteningId(null);
        }
    };

    // Split orders into live vs history
    const liveStates = new Set(["ACCEPTED", "WORKING", "PENDING"]);
    const liveOrders = recentOrders.filter(o => liveStates.has(o.state?.toUpperCase()));
    const historyOrders = recentOrders.filter(o => !liveStates.has(o.state?.toUpperCase()));

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

    const orderTypes = ["Market", "Limit", "Stop", "StopLimit"];

    // ── Target label for display ────────────────────────
    const targetLabel = tradingMode === "group"
        ? (selectedGroup?.name || "—")
        : (selectedAccountIds.length > 0 ? `${selectedAccountIds.length} targets` : "—");

    return (
        <div className="trading-panel tp-v2">
            {/* ── Header: Title ──────── */}
            <div className="tp-header">
                <div className="tp-title">
                    <span className="tp-icon">⚡</span>
                    <h3>Trading Panel</h3>
                </div>
            </div>

            {/* ── Compact Controls Grid ───────────────── */}
            <div className="tp-controls-grid tp-v3-layout">
                {/* Left: Instrument + Qty + Order Types */}
                <div className="tp-left-col">
                    <div className="tp-instrument-row">
                        <div className="tp-inst-left">
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
                                <option value="">Select Instrument</option>
                                {instruments.map((inst) => (
                                    <option key={inst.id} value={inst.id}>
                                        {inst.contract_month || inst.symbol}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* F2: Big Prominent Live Price */}
                        <div
                            className={`tp-live-price-big ${orderType !== "Market" ? "tp-price-clickable" : ""}`}
                            onClick={orderType !== "Market" ? handlePriceClick : undefined}
                            title={orderType !== "Market" ? "Click to auto-fill price" : ""}
                        >
                            <span className="tp-lpb-label">LIVE PRICE</span>
                            <div className="tp-lpb-value-box">
                                <span className={`tp-lpb-value ${change > 0 ? "up" : change < 0 ? "down" : ""} ${priceFlash ? "flash" : ""}`}>
                                    {currentPrice ? fmt(currentPrice) : "—"}
                                </span>
                                {change !== 0 && (
                                    <span className={`tp-lpb-change ${change > 0 ? "up" : "down"}`}>
                                        {change > 0 ? "▲" : "▼"} {fmt(Math.abs(change))}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="tp-inputs-row">
                        <div className="tp-qty-section">
                            <label>QTY</label>
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

                        {(orderType === "Limit" || orderType === "StopLimit") && (
                            <div className="tp-price-section">
                                <label>LIMIT PRICE</label>
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
                                            title="Snap to market"
                                        >⎔</button>
                                    )}
                                </div>
                            </div>
                        )}

                        {(orderType === "Stop" || orderType === "StopLimit") && (
                            <div className="tp-price-section">
                                <label>STOP PRICE</label>
                                <div className="tp-price-input-wrap">
                                    <span className="tp-currency">$</span>
                                    <input
                                        ref={stopInputRef}
                                        type="number"
                                        step="0.25"
                                        placeholder="0.00"
                                        value={stopPrice}
                                        onChange={(e) => setStopPrice(e.target.value)}
                                        className="tp-price-input"
                                    />
                                    {currentPrice && (
                                        <button
                                            className="tp-price-snap"
                                            onClick={() => setStopPrice(String(currentPrice))}
                                            title="Snap to market"
                                        >⎔</button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

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
                                {ot === "StopLimit" ? "STP LMT" : ot.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right: Group/Account Selectors + Actions */}
                <div className="tp-right-col">
                    <div className="tp-selectors">
                        <div className="tp-selector-group">
                            <label className="tp-sel-label">GROUP</label>
                            <select
                                className={`tp-group-select ${tradingMode === "group" ? "active-mode" : ""}`}
                                value={tradingMode === "group" ? (selectedGroupId || "") : ""}
                                onChange={(e) => switchToGroup(e.target.value)}
                            >
                                <option value="">Select Group</option>
                                {groups.map((g) => (
                                    <option key={g.id} value={g.id}>
                                        {g.name} ({g.members?.length || 0})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <span className="tp-or-sep">OR</span>
                        <div className="tp-selector-group">
                            <label className="tp-sel-label">ACCOUNT</label>
                            <select
                                className={`tp-group-select ${tradingMode === "account" ? "active-mode" : ""}`}
                                value=""
                                onChange={(e) => switchToAccount(e.target.value)}
                            >
                                <option value="">Select Account</option>
                                {accountsByUser.map((ug) => (
                                    <optgroup key={ug.user.id} label={`👤 ${ug.user.name}`}>
                                        {ug.accounts.map((a) => (
                                            <option key={a.id} value={a.id}>
                                                {selectedAccountIds.includes(a.id) ? "✓ " : ""}{a.name}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="tp-action-buttons">
                        <div className="tp-skip-confirm-wrap">
                            <input
                                type="checkbox"
                                id="skipConfirmation"
                                checked={skipConfirmation}
                                onChange={(e) => setSkipConfirmation(e.target.checked)}
                            />
                            <label htmlFor="skipConfirmation">Fast trading (skip confirmation)</label>
                        </div>
                        <div className="tp-actions-row">
                            <button
                                className="tp-buy-btn"
                                onClick={() => handleOrderClick("Buy")}
                                disabled={isPlacing || !canTrade}
                            >
                                <span className="tp-btn-label">BUY</span>
                                <span className="tp-btn-price">{ask ? fmt(ask) : "—"}</span>
                            </button>
                            <button
                                className="tp-sell-btn"
                                onClick={() => handleOrderClick("Sell")}
                                disabled={isPlacing || !canTrade}
                            >
                                <span className="tp-btn-label">SELL</span>
                                <span className="tp-btn-price">{bid ? fmt(bid) : "—"}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Account Roster ──────────────────────── */}
            {canTrade && (
                <div className="tp-account-roster">
                    <div className="tp-roster-header">
                        <span className="tp-roster-label">
                            📋 {tradingMode === "group" ? "Group Accounts" : "Target Account"}
                            <strong> ({accountCount})</strong>
                        </span>
                        <span className="tp-roster-total">
                            {quantity} × {accountCount} = <strong>{totalContracts}</strong> contracts
                        </span>
                    </div>
                    <div className="tp-roster-chips">
                        {tradingMode === "group" && groupMembers.map((m) => {
                            const acct = accounts.find(a => a.id === (m.account_id || m.id));
                            const acctName = acct?.name || m.account_name || `#${m.account_id || m.id}`;
                            return (
                                <span key={m.id || m.account_id} className="tp-roster-chip">
                                    {acctName}
                                </span>
                            );
                        })}
                        {tradingMode === "account" && selectedAccountIds.map((id) => (
                            <span key={id} className="tp-roster-chip active">
                                {accounts.find(a => a.id === id)?.name || `#${id}`}
                                <button className="tp-chip-remove" onClick={() => removeAccount(id)}>✕</button>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Error / Result Banner ───────────────── */}
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

            {/* ── Confirmation Modal ──────────────────── */}
            {showConfirm && (
                <div className="tp-confirm-overlay" onClick={() => setShowConfirm(false)}>
                    <div className="tp-confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <h4>⚡ Confirm Order</h4>
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
                                <span>Qty / Account</span>
                                <span>{quantity}</span>
                            </div>
                            {(orderType === "Limit" || orderType === "StopLimit") && (
                                <div className="tp-cd-row">
                                    <span>Limit Price</span>
                                    <span>${price}</span>
                                </div>
                            )}
                            {(orderType === "Stop" || orderType === "StopLimit") && stopPrice && (
                                <div className="tp-cd-row">
                                    <span>Stop Price</span>
                                    <span>${stopPrice}</span>
                                </div>
                            )}
                            <div className="tp-cd-divider" />
                            <div className="tp-cd-row tp-cd-highlight">
                                <span>Target</span>
                                <span>{targetLabel}</span>
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

            {/* ── Live Orders & History (Tabbed) ───────── */}
            <div className="tp-recent">
                <div className="tp-recent-header">
                    <div className="tp-tabs">
                        <button
                            className={`tp-tab ${ordersTab === "live" ? "active" : ""}`}
                            onClick={() => setOrdersTab("live")}
                        >
                            🟢 Live Orders
                            {(liveOrders.length + positions.length) > 0 && (
                                <span className="tp-tab-badge">{liveOrders.length + positions.length}</span>
                            )}
                        </button>
                        <button
                            className={`tp-tab ${ordersTab === "history" ? "active" : ""}`}
                            onClick={() => setOrdersTab("history")}
                        >
                            📜 History
                        </button>
                    </div>
                    <button className="tp-refresh-btn" onClick={() => { loadRecentOrders(); loadPositions(); }}>↻</button>
                </div>

                {ordersTab === "live" ? (
                    <>
                        {/* Open Positions */}
                        {positions.length > 0 && (
                            <div className="tp-positions-section">
                                <div className="tp-section-label">Open Positions</div>
                                <div className="tp-orders-table-wrap">
                                    <table className="tp-orders-table">
                                        <thead>
                                            <tr>
                                                <th>Account</th>
                                                <th>Side</th>
                                                <th>Qty</th>
                                                <th>Entry</th>
                                                <th>Current</th>
                                                <th>P&L</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {positions.map((p, idx) => {
                                                const mktPrice = currentPrice;
                                                const pnl = mktPrice && p.net_price
                                                    ? (p.side === "Long"
                                                        ? (mktPrice - p.net_price) * p.quantity
                                                        : (p.net_price - mktPrice) * p.quantity)
                                                    : null;
                                                return (
                                                    <tr key={`pos-${idx}`}>
                                                        <td className="tp-td-acct">{p.account_name}</td>
                                                        <td className={p.side === "Long" ? "tp-text-green" : "tp-text-red"}>
                                                            {p.side}
                                                        </td>
                                                        <td>{p.quantity}</td>
                                                        <td>{p.net_price ? `$${fmt(p.net_price)}` : "—"}</td>
                                                        <td>{mktPrice ? `$${fmt(mktPrice)}` : "—"}</td>
                                                        <td>
                                                            {pnl != null ? (
                                                                <span className={pnl >= 0 ? "tp-text-green" : "tp-text-red"}>
                                                                    {pnl >= 0 ? "+" : ""}{fmt(pnl)} pts
                                                                </span>
                                                            ) : "—"}
                                                        </td>
                                                        <td>
                                                            <button
                                                                className="tp-flatten-btn"
                                                                onClick={() => handleFlatten(p.account_id)}
                                                                disabled={flatteningId === p.account_id}
                                                                title="Flatten all positions for this account"
                                                            >
                                                                {flatteningId === p.account_id ? "⏳" : "🔴 Flatten"}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Working Orders */}
                        {liveOrders.length > 0 ? (
                            <div className="tp-working-section">
                                <div className="tp-section-label">Working Orders</div>
                                <div className="tp-orders-table-wrap">
                                    <table className="tp-orders-table">
                                        <thead>
                                            <tr>
                                                <th>Time</th>
                                                <th>Account</th>
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
                                            {liveOrders.map((o) => (
                                                <tr key={o.id}>
                                                    <td className="tp-td-time">{fmtTime(o.created_at)}</td>
                                                    <td className="tp-td-acct">{o.account_name || "—"}</td>
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
                                                        {o.broker_order_id && (
                                                            <button
                                                                className="tp-cancel-order-btn"
                                                                onClick={() => cancelOrder(o.broker_order_id, o.account_id)}
                                                                title="Cancel order"
                                                            >✕</button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : positions.length === 0 && (
                            <div className="tp-empty">No active orders or positions</div>
                        )}
                    </>
                ) : (
                    /* History Tab */
                    historyOrders.length === 0 ? (
                        <div className="tp-empty">No order history yet</div>
                    ) : (
                        <div className="tp-orders-table-wrap">
                            <table className="tp-orders-table">
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>Account</th>
                                        <th>Symbol</th>
                                        <th>Side</th>
                                        <th>Qty</th>
                                        <th>Type</th>
                                        <th>Price</th>
                                        <th>Fill</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyOrders.map((o) => (
                                        <tr key={o.id}>
                                            <td className="tp-td-time">{fmtTime(o.created_at)}</td>
                                            <td className="tp-td-acct">{o.account_name || "—"}</td>
                                            <td className="tp-td-sym">{o.contract || o.instrument_symbol}</td>
                                            <td className={o.side === "Buy" ? "tp-text-green" : "tp-text-red"}>
                                                {o.side}
                                            </td>
                                            <td>{o.quantity}</td>
                                            <td>{o.order_type}</td>
                                            <td>{o.price ? `$${fmt(o.price)}` : "MKT"}</td>
                                            <td>{o.fill_price ? `$${fmt(o.fill_price)}` : "—"}</td>
                                            <td>
                                                <span className={`tp-status-badge ${o.state?.toLowerCase()}`}>
                                                    {o.state}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}

