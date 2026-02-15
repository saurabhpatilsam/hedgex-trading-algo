import { useState, useEffect, useCallback } from "react";
import { accountsApi } from "../api";

const EMPTY_FORM = {
    name: "",
    owner: "",
    broker: "Apex",
    platform: "Tradovate",
    account_number: "",
    is_active: true,
};

export default function AccountManager() {
    const [accounts, setAccounts] = useState([]);
    const [form, setForm] = useState(EMPTY_FORM);
    const [editingId, setEditingId] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        try {
            const data = await accountsApi.list();
            setAccounts(data);
        } catch (e) {
            setError(e.message);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Group accounts by owner
    const grouped = {};
    accounts.forEach((a) => {
        const key = a.owner || "Unassigned";
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(a);
    });
    const ownerKeys = Object.keys(grouped).sort((a, b) => {
        if (a === "Unassigned") return 1;
        if (b === "Unassigned") return -1;
        return a.localeCompare(b);
    });

    /* ── CRUD ─────────────────────────────────────── */
    const openCreate = () => { setForm(EMPTY_FORM); setEditingId(null); setShowModal(true); setError(""); };

    const openEdit = (account) => {
        setForm({
            name: account.name, owner: account.owner || "", broker: account.broker,
            platform: account.platform, account_number: account.account_number, is_active: account.is_active,
        });
        setEditingId(account.id);
        setShowModal(true);
        setError("");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) await accountsApi.update(editingId, form);
            else await accountsApi.create(form);
            setShowModal(false); setForm(EMPTY_FORM); setEditingId(null); load();
        } catch (err) { setError(err.message); }
    };

    const handleDelete = async (id) => {
        if (!confirm("Delete this account?")) return;
        try { await accountsApi.delete(id); load(); } catch (err) { setError(err.message); }
    };

    const handleToggleActive = async (account) => {
        try {
            await accountsApi.update(account.id, { is_active: !account.is_active });
            load();
        } catch (err) { setError(err.message); }
    };

    return (
        <div className="manager-page">
            <div className="page-header">
                <h2>Prop Accounts</h2>
                <button className="btn btn-primary" onClick={openCreate}>+ Add Account</button>
            </div>

            {error && <div className="error-banner">{error}</div>}

            {/* Stats */}
            <div className="stats-row">
                <div className="stat-pill total"><span className="stat-num">{accounts.length}</span> Total</div>
                <div className="stat-pill"><span className="stat-num">{accounts.filter(a => a.is_active).length}</span> Active</div>
                <div className="stat-pill"><span className="stat-num">{ownerKeys.filter(k => k !== "Unassigned").length}</span> Users</div>
            </div>

            {/* Grouped Tables */}
            {ownerKeys.length === 0 && (
                <div className="zone-empty" style={{ padding: "48px", textAlign: "center" }}>
                    No accounts yet. Click "+ Add Account" to start.
                </div>
            )}

            {ownerKeys.map((owner) => (
                <div key={owner} className="owner-table-section">
                    <div className="owner-table-header">
                        <span className="owner-avatar">{owner.charAt(0).toUpperCase()}</span>
                        <span className="owner-label">{owner}</span>
                        <span className="owner-count">{grouped[owner].length} accounts</span>
                    </div>
                    <table className="acct-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Firm</th>
                                <th>Platform</th>
                                <th>Acct #</th>
                                <th>Status</th>
                                <th style={{ width: "80px" }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {grouped[owner].map((acct) => (
                                <tr key={acct.id} className={!acct.is_active ? "row-inactive" : ""}>
                                    <td className="acct-name-cell">{acct.name}</td>
                                    <td>{acct.broker}</td>
                                    <td>{acct.platform}</td>
                                    <td className="mono-cell">{acct.account_number || "—"}</td>
                                    <td>
                                        <button
                                            className={`status-toggle ${acct.is_active ? "active" : "inactive"}`}
                                            onClick={() => handleToggleActive(acct)}
                                            title={acct.is_active ? "Click to deactivate" : "Click to activate"}
                                        >
                                            {acct.is_active ? "Active" : "Inactive"}
                                        </button>
                                    </td>
                                    <td>
                                        <div className="table-actions">
                                            <button className="chip-btn" onClick={() => openEdit(acct)} title="Edit">✏️</button>
                                            <button className="chip-btn chip-btn-del" onClick={() => handleDelete(acct.id)} title="Delete">✕</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingId ? "Edit Account" : "New Prop Account"}</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Account Name</label>
                                    <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Apex-Acc-1" />
                                </div>
                                <div className="form-group">
                                    <label>User / Owner</label>
                                    <input type="text" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="e.g. Saurabh" />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Prop Firm</label>
                                    <select value={form.broker} onChange={(e) => setForm({ ...form, broker: e.target.value })}>
                                        <option value="Apex">Apex Trader Funding</option>
                                        <option value="Topstep">Topstep</option>
                                        <option value="MyFundedFutures">MyFundedFutures</option>
                                        <option value="TradeDay">TradeDay</option>
                                        <option value="Bulenox">Bulenox</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Platform</label>
                                    <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
                                        <option value="Tradovate">Tradovate</option>
                                        <option value="Rithmic">Rithmic</option>
                                        <option value="NinjaTrader">NinjaTrader</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Account Number</label>
                                    <input type="text" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} placeholder="e.g. APEX-12345" />
                                </div>
                                <div className="form-group">
                                    <label>Status</label>
                                    <select value={form.is_active ? "true" : "false"} onChange={(e) => setForm({ ...form, is_active: e.target.value === "true" })}>
                                        <option value="true">Active</option>
                                        <option value="false">Inactive</option>
                                    </select>
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{editingId ? "Save Changes" : "Create Account"}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
