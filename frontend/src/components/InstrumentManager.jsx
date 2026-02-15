import { useState, useEffect, useCallback } from "react";
import { instrumentsApi } from "../api";

const EMPTY_FORM = {
    symbol: "",
    exchange: "CME",
    instrument_type: "FUTURES",
    contract_month: "",
    lot_size: 1,
    tick_size: 0.25,
    tick_value: 12.50,
    margin: 0,
    is_active: true,
};

// Common US futures contracts presets
const PRESETS = [
    { symbol: "ES", name: "E-mini S&P 500", exchange: "CME", tick_size: 0.25, tick_value: 12.50, type: "FUTURES" },
    { symbol: "NQ", name: "E-mini NASDAQ", exchange: "CME", tick_size: 0.25, tick_value: 5.00, type: "FUTURES" },
    { symbol: "MES", name: "Micro E-mini S&P", exchange: "CME", tick_size: 0.25, tick_value: 1.25, type: "MICRO_FUTURES" },
    { symbol: "MNQ", name: "Micro E-mini NASDAQ", exchange: "CME", tick_size: 0.25, tick_value: 0.50, type: "MICRO_FUTURES" },
    { symbol: "YM", name: "E-mini Dow", exchange: "CBOT", tick_size: 1.0, tick_value: 5.00, type: "FUTURES" },
    { symbol: "RTY", name: "E-mini Russell", exchange: "CME", tick_size: 0.10, tick_value: 5.00, type: "FUTURES" },
    { symbol: "CL", name: "Crude Oil", exchange: "NYMEX", tick_size: 0.01, tick_value: 10.00, type: "FUTURES" },
    { symbol: "GC", name: "Gold", exchange: "COMEX", tick_size: 0.10, tick_value: 10.00, type: "FUTURES" },
    { symbol: "SI", name: "Silver", exchange: "COMEX", tick_size: 0.005, tick_value: 25.00, type: "FUTURES" },
    { symbol: "ZB", name: "30-Year T-Bond", exchange: "CBOT", tick_size: 0.03125, tick_value: 31.25, type: "FUTURES" },
];

export default function InstrumentManager() {
    const [instruments, setInstruments] = useState([]);
    const [form, setForm] = useState(EMPTY_FORM);
    const [editingId, setEditingId] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        try {
            const data = await instrumentsApi.list();
            setInstruments(data);
        } catch (e) {
            setError(e.message);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const openCreate = () => {
        setForm(EMPTY_FORM);
        setEditingId(null);
        setShowModal(true);
        setError("");
    };

    const openEdit = (inst) => {
        setForm({
            symbol: inst.symbol,
            exchange: inst.exchange,
            instrument_type: inst.instrument_type,
            contract_month: inst.contract_month,
            lot_size: inst.lot_size,
            tick_size: inst.tick_size,
            tick_value: inst.tick_value,
            margin: inst.margin,
            is_active: inst.is_active,
        });
        setEditingId(inst.id);
        setShowModal(true);
        setError("");
    };

    const applyPreset = (preset) => {
        setForm({
            ...form,
            symbol: preset.symbol,
            exchange: preset.exchange,
            tick_size: preset.tick_size,
            tick_value: preset.tick_value,
            instrument_type: preset.type,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await instrumentsApi.update(editingId, form);
            } else {
                await instrumentsApi.create(form);
            }
            setShowModal(false);
            setForm(EMPTY_FORM);
            setEditingId(null);
            load();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("Delete this instrument?")) return;
        try {
            await instrumentsApi.delete(id);
            load();
        } catch (err) {
            setError(err.message);
        }
    };

    const toggleActive = async (inst) => {
        try {
            await instrumentsApi.update(inst.id, { is_active: !inst.is_active });
            load();
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="manager-page">
            <div className="page-header">
                <h2>Futures Instruments</h2>
                <button className="btn btn-primary" onClick={openCreate}>
                    + Add Instrument
                </button>
            </div>

            {error && <div className="error-banner">{error}</div>}

            <div className="pots-overview">
                <div className="stat-card">
                    <span className="stat-value">
                        {instruments.filter((i) => i.is_active).length}
                    </span>
                    <span className="stat-label">Active</span>
                </div>
                <div className="stat-card">
                    <span className="stat-value">{instruments.length}</span>
                    <span className="stat-label">Total Instruments</span>
                </div>
            </div>

            <div className="table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Symbol</th>
                            <th>Exchange</th>
                            <th>Type</th>
                            <th>Contract</th>
                            <th>Lot Size</th>
                            <th>Tick Size</th>
                            <th>Tick Value</th>
                            <th>Margin</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {instruments.length === 0 && (
                            <tr>
                                <td colSpan="10" className="empty-state">
                                    No instruments configured. Add a futures contract to get started.
                                </td>
                            </tr>
                        )}
                        {instruments.map((inst) => (
                            <tr key={inst.id} className={inst.is_active ? "" : "row-inactive"}>
                                <td className="symbol-cell">{inst.symbol}</td>
                                <td>{inst.exchange}</td>
                                <td>
                                    <span className="badge badge-type">{inst.instrument_type}</span>
                                </td>
                                <td>{inst.contract_month || "—"}</td>
                                <td>{inst.lot_size}</td>
                                <td>${inst.tick_size}</td>
                                <td>${inst.tick_value.toFixed(2)}</td>
                                <td>{inst.margin > 0 ? `$${inst.margin.toFixed(0)}` : "—"}</td>
                                <td>
                                    <button
                                        className={`toggle-btn ${inst.is_active ? "on" : "off"}`}
                                        onClick={() => toggleActive(inst)}
                                        title={inst.is_active ? "Deactivate" : "Activate"}
                                    >
                                        <span className="toggle-track">
                                            <span className="toggle-thumb" />
                                        </span>
                                    </button>
                                </td>
                                <td className="actions-cell">
                                    <button
                                        className="btn btn-sm btn-edit"
                                        onClick={() => openEdit(inst)}
                                    >
                                        ✏️
                                    </button>
                                    <button
                                        className="btn btn-sm btn-delete"
                                        onClick={() => handleDelete(inst.id)}
                                    >
                                        🗑️
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingId ? "Edit Instrument" : "Add Futures Contract"}</h3>
                            <button
                                className="modal-close"
                                onClick={() => setShowModal(false)}
                            >
                                ✕
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-form">
                            {/* Quick Presets */}
                            {!editingId && (
                                <div className="presets-section">
                                    <label>Quick Presets</label>
                                    <div className="preset-chips">
                                        {PRESETS.map((p) => (
                                            <button
                                                type="button"
                                                key={p.symbol}
                                                className={`preset-chip ${form.symbol === p.symbol ? "active" : ""}`}
                                                onClick={() => applyPreset(p)}
                                                title={p.name}
                                            >
                                                {p.symbol}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Symbol</label>
                                    <input
                                        type="text"
                                        value={form.symbol}
                                        onChange={(e) =>
                                            setForm({ ...form, symbol: e.target.value.toUpperCase() })
                                        }
                                        required
                                        placeholder="e.g. ES, NQ, CL"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Contract Month</label>
                                    <input
                                        type="month"
                                        value={form.contract_month}
                                        onChange={(e) =>
                                            setForm({ ...form, contract_month: e.target.value })
                                        }
                                        placeholder="e.g. 2026-03"
                                    />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Exchange</label>
                                    <select
                                        value={form.exchange}
                                        onChange={(e) =>
                                            setForm({ ...form, exchange: e.target.value })
                                        }
                                    >
                                        <option value="CME">CME</option>
                                        <option value="CBOT">CBOT</option>
                                        <option value="NYMEX">NYMEX</option>
                                        <option value="COMEX">COMEX</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Type</label>
                                    <select
                                        value={form.instrument_type}
                                        onChange={(e) =>
                                            setForm({ ...form, instrument_type: e.target.value })
                                        }
                                    >
                                        <option value="FUTURES">Futures</option>
                                        <option value="MICRO_FUTURES">Micro Futures</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Lot Size</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={form.lot_size}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                lot_size: parseInt(e.target.value) || 1,
                                            })
                                        }
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Tick Size ($)</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        min="0.001"
                                        value={form.tick_size}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                tick_size: parseFloat(e.target.value) || 0.25,
                                            })
                                        }
                                    />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Tick Value ($)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={form.tick_value}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                tick_value: parseFloat(e.target.value) || 0,
                                            })
                                        }
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Margin ($)</label>
                                    <input
                                        type="number"
                                        step="1"
                                        min="0"
                                        value={form.margin}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                margin: parseFloat(e.target.value) || 0,
                                            })
                                        }
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Status</label>
                                <select
                                    value={form.is_active ? "true" : "false"}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            is_active: e.target.value === "true",
                                        })
                                    }
                                >
                                    <option value="true">Active</option>
                                    <option value="false">Inactive</option>
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="btn btn-cancel"
                                    onClick={() => setShowModal(false)}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingId ? "Save Changes" : "Add Instrument"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
