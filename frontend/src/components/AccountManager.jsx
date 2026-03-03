import { useState, useEffect, useCallback } from "react";
import { accountsApi, usersApi } from "../api";

const BROKERS = ["Apex", "TakeProfitTrader", "MFF", "Topstep", "TradeDay", "Bulenox", "Other"];

export default function AccountManager() {
    const [users, setUsers] = useState([]);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // User creation
    const [showAddUser, setShowAddUser] = useState(false);
    const [newUserName, setNewUserName] = useState("");

    // Broker Account Modal (Credential)
    const [showCredModal, setShowCredModal] = useState(false);
    const [credUserId, setCredUserId] = useState(null);
    const [editingCredId, setEditingCredId] = useState(null);
    const [credForm, setCredForm] = useState({
        broker: "Apex", login_id: "", password: "", is_active: true
    });

    // Sub-Account Modal
    const [showAcctModal, setShowAcctModal] = useState(false);
    const [acctCredId, setAcctCredId] = useState(null);
    const [editingAcctId, setEditingAcctId] = useState(null);
    const [acctForm, setAcctForm] = useState({
        name: "", account_number: "", is_active: true,
    });

    // Expanded user
    const [expandedUser, setExpandedUser] = useState(null);

    // Password visibility
    const [visiblePasswords, setVisiblePasswords] = useState({});

    // ── MULTI-SELECT ──────────────────────────────────────
    const [selectedAccounts, setSelectedAccounts] = useState(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);
    const [flattenResult, setFlattenResult] = useState(null);
    const [flattenConfirm, setFlattenConfirm] = useState(false);

    const load = useCallback(async () => {
        try {
            const u = await usersApi.list();
            setUsers(u);
        } catch (e) { setError(e.message); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const clearAlerts = () => { setError(""); setSuccess(""); };

    // Collect all sub-accounts for selection helpers
    const allSubAccounts = [];
    users.forEach(user => {
        (user.credentials || []).forEach(cred => {
            (cred.accounts || []).forEach(acct => {
                allSubAccounts.push({
                    ...acct,
                    credentialId: cred.id,
                    broker: cred.broker,
                    userName: user.name,
                    userId: user.id,
                });
            });
        });
    });

    // Toggle a single account selection
    const toggleSelect = (acctId) => {
        setSelectedAccounts(prev => {
            const next = new Set(prev);
            if (next.has(acctId)) next.delete(acctId);
            else next.add(acctId);
            return next;
        });
    };

    // Select/deselect all visible accounts
    const selectAll = () => {
        if (selectedAccounts.size === allSubAccounts.length) {
            setSelectedAccounts(new Set());
        } else {
            setSelectedAccounts(new Set(allSubAccounts.map(a => a.id)));
        }
    };

    // Select all for a specific credential
    const selectAllForCred = (cred) => {
        const credAcctIds = (cred.accounts || []).map(a => a.id);
        setSelectedAccounts(prev => {
            const next = new Set(prev);
            const allSelected = credAcctIds.every(id => next.has(id));
            if (allSelected) credAcctIds.forEach(id => next.delete(id));
            else credAcctIds.forEach(id => next.add(id));
            return next;
        });
    };

    // ── BULK ACTIONS ──────────────────────────────────────

    const handleRefreshSelected = async () => {
        if (selectedAccounts.size === 0) return;
        setBulkLoading(true);
        clearAlerts();
        try {
            const res = await accountsApi.syncSelected([...selectedAccounts]);
            setSuccess(`Synced ${res.synced} account(s), ${res.errors} error(s)`);
            await load();
        } catch (e) {
            setError(e.message);
        }
        setBulkLoading(false);
    };

    const handleFlattenSelected = async () => {
        if (selectedAccounts.size === 0) return;
        if (!flattenConfirm) {
            setFlattenConfirm(true);
            return;
        }
        setFlattenConfirm(false);
        setBulkLoading(true);
        clearAlerts();
        setFlattenResult(null);
        try {
            const res = await accountsApi.flatten([...selectedAccounts]);
            setFlattenResult(res);
            setSuccess(
                `Flatten complete: ${res.total_orders_cancelled} orders cancelled, ` +
                `${res.total_positions_flattened} positions closed`
            );
            await load();
        } catch (e) {
            setError(e.message);
        }
        setBulkLoading(false);
    };

    const handleClearSelection = () => {
        setSelectedAccounts(new Set());
        setFlattenConfirm(false);
        setFlattenResult(null);
    };

    // ── User CRUD ────────────────────────────────────────
    const handleAddUser = async (e) => {
        e.preventDefault();
        if (!newUserName.trim()) return;
        clearAlerts();
        try {
            await usersApi.create({ name: newUserName.trim() });
            setNewUserName("");
            setShowAddUser(false);
            setSuccess(`User "${newUserName.trim()}" created`);
            load();
        } catch (err) { setError(err.message); }
    };

    const handleDeleteUser = async (userId, userName) => {
        if (!confirm(`Delete user "${userName}" and all their accounts?`)) return;
        clearAlerts();
        try {
            await usersApi.delete(userId);
            setSuccess(`User "${userName}" deleted`);
            load();
        } catch (err) { setError(err.message); }
    };

    // ── Broker Accounts (Credentials) ────────────────────
    const openAddBroker = (userId) => {
        setCredUserId(userId);
        setEditingCredId(null);
        setCredForm({ broker: "Apex", login_id: "", password: "", is_active: true });
        setShowCredModal(true);
        clearAlerts();
    };

    const openEditBroker = (userId, cred) => {
        setCredUserId(userId);
        setEditingCredId(cred.id);
        setCredForm({
            broker: cred.broker,
            login_id: cred.login_id,
            password: cred.password,
            is_active: cred.is_active
        });
        setShowCredModal(true);
        clearAlerts();
    };

    const handleSaveBroker = async (e) => {
        e.preventDefault();
        clearAlerts();
        try {
            if (editingCredId) {
                await usersApi.updateCredential(credUserId, editingCredId, credForm);
                setSuccess(`Broker details updated`);
            } else {
                await usersApi.addCredential(credUserId, credForm);
                setSuccess(`Broker account added`);
            }
            setShowCredModal(false);
            load();
        } catch (err) { setError(err.message); }
    };

    const handleDeleteBroker = async (userId, credId, broker) => {
        if (!confirm(`Delete ${broker} account and all sub-accounts?`)) return;
        clearAlerts();
        try {
            await usersApi.deleteCredential(userId, credId);
            load();
        } catch (err) { setError(err.message); }
    };

    const togglePassword = (credId) => {
        setVisiblePasswords(prev => ({ ...prev, [credId]: !prev[credId] }));
    };

    const toggleCredStatus = async (userId, cred) => {
        try {
            await usersApi.updateCredential(userId, cred.id, { is_active: !cred.is_active });
            load();
        } catch (e) { setError(e.message); }
    };

    const handleSyncAll = async (userId) => {
        clearAlerts();
        try {
            const res = await usersApi.syncAll(userId);
            setSuccess(res?.message || "Sync complete");
            load();
        } catch (e) { setError(e.message); }
    };

    // ── Sub-Accounts ─────────────────────────────────────
    const openAddSubAccount = (credId) => {
        setAcctCredId(credId);
        setEditingAcctId(null);
        setAcctForm({ name: "", account_number: "", is_active: true });
        setShowAcctModal(true);
        clearAlerts();
    };

    const openEditSubAccount = (account) => {
        setAcctCredId(account.credential_id);
        setEditingAcctId(account.id);
        setAcctForm({
            name: account.name,
            account_number: account.account_number,
            is_active: account.is_active,
        });
        setShowAcctModal(true);
        clearAlerts();
    };

    const handleSaveSubAccount = async (e) => {
        e.preventDefault();
        clearAlerts();
        try {
            if (editingAcctId) {
                await accountsApi.update(editingAcctId, acctForm);
                setSuccess("Account updated");
            } else {
                await accountsApi.create({ ...acctForm, credential_id: acctCredId });
                setSuccess("Sub-account created");
            }
            setShowAcctModal(false);
            load();
        } catch (err) { setError(err.message); }
    };

    const handleDeleteSubAccount = async (id) => {
        if (!confirm("Delete this sub-account?")) return;
        clearAlerts();
        try { await accountsApi.delete(id); load(); } catch (err) { setError(err.message); }
    };

    // Stats
    const totalUsers = users.length;
    const totalBrokers = users.reduce((acc, u) => acc + (u.credentials?.length || 0), 0);
    const totalAccounts = allSubAccounts.length;

    return (
        <div className="manager-page">
            <div className="page-header">
                <h2>Users & Accounts</h2>
                <button className="btn btn-primary" onClick={() => { setShowAddUser(true); clearAlerts(); }}>
                    + Add User
                </button>
            </div>

            {error && <div className="error-banner">{error}</div>}
            {success && <div className="success-banner">{success}</div>}

            {/* Stats */}
            <div className="stats-row">
                <div className="stat-pill total"><span className="stat-num">{totalUsers}</span> Users</div>
                <div className="stat-pill"><span className="stat-num">{totalBrokers}</span> Broker Connects</div>
                <div className="stat-pill"><span className="stat-num">{totalAccounts}</span> Sub-Accounts</div>
            </div>

            {/* ── MULTI-SELECT ACTION BAR ──────────────────── */}
            {selectedAccounts.size > 0 && (
                <div className="bulk-action-bar">
                    <div className="bulk-left">
                        <span className="bulk-count">
                            {selectedAccounts.size} account{selectedAccounts.size !== 1 ? "s" : ""} selected
                        </span>
                        <button className="btn-bulk-clear" onClick={handleClearSelection}>
                            ✕ Clear
                        </button>
                    </div>
                    <div className="bulk-right">
                        <button
                            className="btn-bulk-refresh"
                            onClick={handleRefreshSelected}
                            disabled={bulkLoading}
                        >
                            {bulkLoading ? "⏳ Syncing..." : "🔄 Refresh Selected"}
                        </button>
                        <button
                            className={`btn-bulk-kill ${flattenConfirm ? "confirming" : ""}`}
                            onClick={handleFlattenSelected}
                            disabled={bulkLoading}
                        >
                            {bulkLoading ? (
                                "⏳ Flattening..."
                            ) : flattenConfirm ? (
                                "⚠️ CLICK AGAIN TO CONFIRM"
                            ) : (
                                "💀 Kill Selected"
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Flatten Result Report */}
            {flattenResult && (
                <div className="flatten-result-banner">
                    <div className="flatten-result-header">
                        <h4>💀 Flatten Report</h4>
                        <button className="btn-dismiss" onClick={() => setFlattenResult(null)}>✕</button>
                    </div>
                    <div className="flatten-result-stats">
                        <span>Accounts: {flattenResult.accounts_processed}</span>
                        <span>Orders Cancelled: {flattenResult.total_orders_cancelled}</span>
                        <span>Positions Closed: {flattenResult.total_positions_flattened}</span>
                        {flattenResult.total_errors > 0 && (
                            <span className="err">Errors: {flattenResult.total_errors}</span>
                        )}
                    </div>
                    <div className="flatten-result-details">
                        {flattenResult.reports?.map((r, i) => (
                            <div key={i} className="flatten-detail-row">
                                <strong>{r.account}</strong>
                                {r.error && <span className="err"> — {r.error}</span>}
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
                </div>
            )}

            {/* Add User Inline */}
            {showAddUser && (
                <form onSubmit={handleAddUser} className="inst-add-form" style={{ marginBottom: 16 }}>
                    <input
                        type="text" value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                        placeholder="User name (e.g. Saurabh)" required autoFocus
                    />
                    <button type="submit" className="btn btn-sm btn-primary">Create</button>
                    <button type="button" className="btn btn-sm btn-cancel" onClick={() => setShowAddUser(false)}>Cancel</button>
                </form>
            )}

            {/* User Cards */}
            {users.length === 0 && !showAddUser && (
                <div className="zone-empty" style={{ padding: 48, textAlign: "center" }}>
                    No users yet. Click &quot;+ Add User&quot; to start.
                </div>
            )}

            {users.map((user) => {
                const userCreds = user.credentials || [];
                const isExpanded = expandedUser === user.id;

                // Count how many of this user's sub-accounts are selected
                const userAcctIds = userCreds.flatMap(c => (c.accounts || []).map(a => a.id));
                const userSelectedCount = userAcctIds.filter(id => selectedAccounts.has(id)).length;

                return (
                    <div key={user.id} className={`user-card ${isExpanded ? "user-card-expanded" : ""}`}>
                        {/* User header */}
                        <div className="user-card-header" onClick={() => setExpandedUser(isExpanded ? null : user.id)}>
                            <div className="user-header-left">
                                <span className="owner-avatar">{user.name.charAt(0).toUpperCase()}</span>
                                <span className="user-header-name">{user.name}</span>
                                {user.static_ip ? (
                                    <span className="ip-badge ip-assigned" title={`Dedicated IP: ${user.static_ip}${user.proxy_region ? ` (${user.proxy_region})` : ''}`}>
                                        🌐 {user.static_ip}
                                    </span>
                                ) : (
                                    <span className="ip-badge ip-none" title="No dedicated IP assigned">
                                        🌐 No IP
                                    </span>
                                )}
                                <span className="user-header-stats">
                                    {userCreds.length} brokers
                                    {userSelectedCount > 0 && (
                                        <span className="selected-badge">{userSelectedCount} selected</span>
                                    )}
                                </span>
                            </div>
                            <div className="user-header-right" onClick={(e) => e.stopPropagation()}>
                                <button className="btn btn-sm btn-primary" onClick={() => handleSyncAll(user.id)} title="Refresh All Sub-Accounts">
                                    🔄 Refresh All
                                </button>
                                <button className="btn btn-sm btn-primary" onClick={() => openAddBroker(user.id)} title="Add Broker Connection">
                                    + Add Account
                                </button>
                                <button className="chip-btn chip-btn-del" onClick={() => handleDeleteUser(user.id, user.name)} title="Delete user">
                                    ✕
                                </button>
                                <span className="expand-arrow">{isExpanded ? "▲" : "▼"}</span>
                            </div>
                        </div>

                        {/* Expanded content */}
                        {isExpanded && (
                            <div className="user-card-body">
                                {userCreds.length === 0 ? (
                                    <div className="zone-empty" style={{ padding: 24, textAlign: "center" }}>
                                        No broker accounts yet. Click &quot;+ Add Account&quot; to connect a broker.
                                    </div>
                                ) : (
                                    <div className="creds-grid">
                                        {userCreds.map((cred) => {
                                            const credAcctIds = (cred.accounts || []).map(a => a.id);
                                            const allCredSelected = credAcctIds.length > 0 && credAcctIds.every(id => selectedAccounts.has(id));
                                            const someCredSelected = credAcctIds.some(id => selectedAccounts.has(id));

                                            return (
                                                <div key={cred.id} className={`cred-card-square ${!cred.is_active ? "inactive" : ""}`}>
                                                    {/* Broker Header */}
                                                    <div className="cred-square-header">
                                                        <div className="cred-square-top">
                                                            <span className={`status-dot ${cred.is_active ? "active" : "inactive"}`}></span>
                                                            <span className="cred-broker-name">{cred.broker}</span>
                                                            <div className="cred-actions-mini">
                                                                <button className="icon-btn-sm" onClick={() => openEditBroker(user.id, cred)} title="Edit">✏️</button>
                                                                <button className="icon-btn-sm warning" onClick={() => toggleCredStatus(user.id, cred)} title="Toggle">
                                                                    {cred.is_active ? "⏸" : "▶️"}
                                                                </button>
                                                                <button className="icon-btn-sm danger" onClick={() => handleDeleteBroker(user.id, cred.id, cred.broker)} title="Delete">✕</button>
                                                            </div>
                                                        </div>
                                                        <div className="cred-square-login">
                                                            <span className="label">ID:</span>
                                                            <span className="value">{cred.login_id}</span>
                                                        </div>
                                                        {cred.error_message && (
                                                            <div className="cred-error-msg" style={{ color: "var(--danger-color)", fontSize: "0.80rem", marginTop: "4px" }}>
                                                                {cred.error_message}
                                                                {cred.last_synced_at && (
                                                                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "2px" }}>
                                                                        Last attempt: {new Date(cred.last_synced_at).toLocaleDateString([], { day: 'numeric', month: 'short' })} — {new Date(cred.last_synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Sub-Accounts with multi-select */}
                                                    <div className="sub-accounts-container">
                                                        <div className="sub-header-compact">
                                                            <div className="sub-header-left">
                                                                {credAcctIds.length > 0 && (
                                                                    <label
                                                                        className="select-all-checkbox"
                                                                        title="Select all accounts for this broker"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={allCredSelected}
                                                                            ref={el => {
                                                                                if (el) el.indeterminate = someCredSelected && !allCredSelected;
                                                                            }}
                                                                            onChange={() => selectAllForCred(cred)}
                                                                        />
                                                                    </label>
                                                                )}
                                                                <span>Accounts ({cred.accounts?.length || 0})</span>
                                                            </div>
                                                            <button className="btn-icon-add" onClick={() => openAddSubAccount(cred.id)} title="Add Sub-Account">+</button>
                                                        </div>

                                                        <div className="sub-list-scroll">
                                                            {(!cred.accounts || cred.accounts.length === 0) ? (
                                                                <div className="sub-empty-compact">No accounts</div>
                                                            ) : (
                                                                cred.accounts.map(acct => {
                                                                    const isSelected = selectedAccounts.has(acct.id);
                                                                    return (
                                                                        <div
                                                                            key={acct.id}
                                                                            className={`sub-acct-row ${isSelected ? "sub-acct-selected" : ""}`}
                                                                        >
                                                                            <label
                                                                                className="sub-acct-checkbox"
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            >
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={isSelected}
                                                                                    onChange={() => toggleSelect(acct.id)}
                                                                                />
                                                                            </label>
                                                                            <div
                                                                                className="sub-acct-info"
                                                                                onClick={() => toggleSelect(acct.id)}
                                                                                style={{ cursor: "pointer", flex: 1 }}
                                                                            >
                                                                                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                                                                                    {acct.last_updated_at && (
                                                                                        <span style={{ fontSize: "0.68rem", color: "var(--gray-400)", fontFamily: "monospace", letterSpacing: "0.5px" }}>
                                                                                            {new Date(acct.last_updated_at).toLocaleDateString([], { day: '2-digit', month: 'short' }).toUpperCase()} • {new Date(acct.last_updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()}
                                                                                        </span>
                                                                                    )}
                                                                                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                                                        <span className="sub-name" title={acct.name} style={{ fontWeight: 600, fontSize: "13px", color: "var(--gray-100)" }}>{acct.name}</span>
                                                                                        <span style={{ fontWeight: 700, color: "var(--accent-1)", fontSize: "13px" }}>
                                                                                            ${acct.balance ? acct.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
                                                                                        </span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <div className="sub-actions">
                                                                                <button className="icon-btn-xs" onClick={() => openEditSubAccount(acct)}>✏️</button>
                                                                                <button className="icon-btn-xs danger" onClick={() => handleDeleteSubAccount(acct.id)}>✕</button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}

            {/* ── SELECT ALL FOOTER ───────────────────────────── */}
            {allSubAccounts.length > 0 && (
                <div className="select-all-bar">
                    <label className="select-all-label" onClick={(e) => e.stopPropagation()}>
                        <input
                            type="checkbox"
                            checked={selectedAccounts.size === allSubAccounts.length && allSubAccounts.length > 0}
                            onChange={selectAll}
                        />
                        <span>Select All ({allSubAccounts.length})</span>
                    </label>
                </div>
            )}

            {/* ── Broker Account Modal ──────────────────────── */}
            {showCredModal && (
                <div className="modal-overlay" onClick={() => setShowCredModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingCredId ? "Edit Broker" : "Add Broker"}</h3>
                            <button className="modal-close" onClick={() => setShowCredModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSaveBroker} className="modal-form">
                            <div className="form-group">
                                <label>Broker</label>
                                <select value={credForm.broker} onChange={(e) => setCredForm({ ...credForm, broker: e.target.value })}>
                                    {BROKERS.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Login ID</label>
                                <input type="text" value={credForm.login_id}
                                    onChange={(e) => setCredForm({ ...credForm, login_id: e.target.value })}
                                    placeholder="Broker Login ID" required />
                            </div>
                            <div className="form-group">
                                <label>Password</label>
                                <input type="password" value={credForm.password}
                                    onChange={(e) => setCredForm({ ...credForm, password: e.target.value })}
                                    placeholder="Broker Password" required />
                            </div>
                            <div className="form-group">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={credForm.is_active}
                                        onChange={(e) => setCredForm({ ...credForm, is_active: e.target.checked })}
                                    />
                                    <span>Connection Active</span>
                                </label>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-cancel" onClick={() => setShowCredModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">
                                    {editingCredId ? "Save Changes" : "Save Broker"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Sub-Account Modal ────────────────────────── */}
            {showAcctModal && (
                <div className="modal-overlay" onClick={() => setShowAcctModal(false)}>
                    <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingAcctId ? "Edit Account" : "Add Account"}</h3>
                            <button className="modal-close" onClick={() => setShowAcctModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSaveSubAccount} className="modal-form">
                            <div className="form-group">
                                <label>Account Name</label>
                                <input type="text" value={acctForm.name}
                                    onChange={(e) => setAcctForm({ ...acctForm, name: e.target.value, account_number: e.target.value })}
                                    required placeholder="e.g. Apex-01" autoFocus />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn-cancel" onClick={() => setShowAcctModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">
                                    {editingAcctId ? "Save" : "Add"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
