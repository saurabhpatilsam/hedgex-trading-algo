import { useState, useEffect, useCallback } from "react";
import { groupsApi, accountsApi } from "../api";

export default function GroupManager() {
    const [groups, setGroups] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState("");
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState("");
    const [expandedGroup, setExpandedGroup] = useState(null);
    const [error, setError] = useState("");

    // Pending (unsaved) changes: { [groupId]: { potL: [accountId, ...], potS: [accountId, ...] } }
    const [pending, setPending] = useState({});
    const [saving, setSaving] = useState(null); // groupId currently saving

    const load = useCallback(async () => {
        try {
            const [g, a] = await Promise.all([groupsApi.list(), accountsApi.list()]);
            setGroups(g);
            setAccounts(a);
        } catch (e) {
            setError(e.message);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const activeAccounts = accounts.filter((a) => a.is_active);

    // Get what's currently in a group (from server data + pending)
    const getGroupState = (group) => {
        if (pending[group.id]) return pending[group.id];
        const members = group.members || [];
        return {
            potL: members.filter((m) => m.pot === "POT-L").map((m) => m.account_id),
            potS: members.filter((m) => m.pot === "POT-S").map((m) => m.account_id),
        };
    };

    // Check if a group has unsaved changes
    const hasChanges = (group) => {
        if (!pending[group.id]) return false;
        const members = group.members || [];
        const serverL = members.filter((m) => m.pot === "POT-L").map((m) => m.account_id).sort().join(",");
        const serverS = members.filter((m) => m.pot === "POT-S").map((m) => m.account_id).sort().join(",");
        const pendL = [...pending[group.id].potL].sort().join(",");
        const pendS = [...pending[group.id].potS].sort().join(",");
        return serverL !== pendL || serverS !== pendS;
    };

    // Sort groups: expanded/editing group comes first
    const sortedGroups = [...groups].sort((a, b) => {
        if (a.id === expandedGroup) return -1;
        if (b.id === expandedGroup) return 1;
        return 0;
    });

    /* ── Drag & Drop ─────────────────────────────── */
    const handleDragStart = (e, accountId) => {
        e.dataTransfer.setData("text/plain", String(accountId));
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDropToPot = (e, groupId, pot) => {
        e.preventDefault();
        e.stopPropagation();
        const accountId = parseInt(e.dataTransfer.getData("text/plain"));
        if (!accountId) return;

        const droppedAccount = getAccount(accountId);
        if (!droppedAccount) return;

        const state = getGroupState(groups.find((g) => g.id === groupId));
        const targetPot = pot === "POT-L" ? state.potL : state.potS;

        // Same-user validation: check if an account from the same user is already in this pot
        const droppedUserId = droppedAccount.user_id;
        if (droppedUserId) {
            const existingFromSameUser = targetPot.find((id) => {
                if (id === accountId) return false; // skip self
                const acct = getAccount(id);
                return acct && acct.user_id === droppedUserId;
            });
            if (existingFromSameUser) {
                const existingName = getAccountName(existingFromSameUser);
                setError(`Cannot add to ${pot}: user already has account "${existingName}" in this pot. Each pot must have accounts from different users.`);
                return;
            }
        }

        setError("");
        const newState = {
            potL: state.potL.filter((id) => id !== accountId),
            potS: state.potS.filter((id) => id !== accountId),
        };

        if (pot === "POT-L") {
            newState.potL = [...newState.potL, accountId];
        } else {
            newState.potS = [...newState.potS, accountId];
        }

        setPending({ ...pending, [groupId]: newState });
    };

    const handleRemoveFromGroup = (groupId, accountId) => {
        const group = groups.find((g) => g.id === groupId);
        const state = getGroupState(group);
        setPending({
            ...pending,
            [groupId]: {
                potL: state.potL.filter((id) => id !== accountId),
                potS: state.potS.filter((id) => id !== accountId),
            },
        });
    };

    /* ── Save Group ──────────────────────────────── */
    const handleSave = async (groupId) => {
        const state = pending[groupId];
        if (!state) return;

        setSaving(groupId);
        setError("");
        try {
            const group = groups.find((g) => g.id === groupId);
            const members = group.members || [];

            // Remove all current members
            for (const m of members) {
                await groupsApi.removeMember(groupId, m.account_id);
            }

            // Add POT-L
            for (const accountId of state.potL) {
                await groupsApi.addMember(groupId, accountId, "POT-L");
            }

            // Add POT-S
            for (const accountId of state.potS) {
                await groupsApi.addMember(groupId, accountId, "POT-S");
            }

            // Clear pending and reload
            const newPending = { ...pending };
            delete newPending[groupId];
            setPending(newPending);
            await load();
        } catch (err) {
            setError(err.message);
        }
        setSaving(null);
    };

    const handleDiscard = (groupId) => {
        const newPending = { ...pending };
        delete newPending[groupId];
        setPending(newPending);
    };

    /* ── CRUD ────────────────────────────────────── */
    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newName.trim()) return;
        try {
            await groupsApi.create({ name: newName.trim() });
            setNewName("");
            setShowCreate(false);
            load();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleRename = async (id) => {
        if (!editName.trim()) return;
        try {
            await groupsApi.update(id, { name: editName.trim() });
            setEditingId(null);
            load();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("Delete this group? All account assignments for this group will be removed.")) return;
        try {
            await groupsApi.delete(id);
            if (expandedGroup === id) setExpandedGroup(null);
            load();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleToggle = (groupId) => {
        setExpandedGroup(expandedGroup === groupId ? null : groupId);
    };

    const getAccount = (accountId) => accounts.find((a) => a.id === accountId);
    const getAccountName = (accountId) => {
        const acct = getAccount(accountId);
        return acct ? acct.name : `#${accountId}`;
    };

    return (
        <div className="manager-page">
            <div className="page-header">
                <h2>Trading Groups</h2>
                <button className="btn btn-primary" onClick={() => { setShowCreate(true); setError(""); }}>
                    + Create Group
                </button>
            </div>

            {error && <div className="error-banner">{error}</div>}

            {/* Create Group Inline */}
            {showCreate && (
                <form onSubmit={handleCreate} className="create-group-bar">
                    <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Group name (e.g. Saurabh)"
                        autoFocus
                    />
                    <button type="submit" className="btn btn-primary btn-sm">Create</button>
                    <button type="button" className="btn btn-cancel btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
                </form>
            )}

            {/* Stats */}
            <div className="stats-row">
                <div className="stat-pill"><span className="stat-num">{groups.length}</span> Groups</div>
                <div className="stat-pill"><span className="stat-num">{activeAccounts.length}</span> Accounts</div>
            </div>

            {/* ── Account Pool (always at top) ──────────── */}
            <div className="avail-accounts-section">
                <h4>All Accounts <small>(drag into a group's POT-L or POT-S zone below)</small></h4>
                <div className="avail-chips">
                    {activeAccounts.length === 0 && (
                        <div className="zone-empty" style={{ padding: "12px" }}>
                            No accounts yet. Go to the Accounts tab to create some.
                        </div>
                    )}
                    {Object.entries(
                        activeAccounts.reduce((acc, account) => {
                            const owner = account.owner || 'Unassigned';
                            if (!acc[owner]) acc[owner] = [];
                            acc[owner].push(account);
                            return acc;
                        }, {})
                    ).sort(([a], [b]) => a.localeCompare(b)).map(([owner, accounts]) => (
                        <div key={owner} className="owner-section">
                            <div className="owner-header">{owner}</div>
                            <div className="owner-accounts">
                                {accounts.map((a) => (
                                    <div
                                        key={a.id}
                                        className="avail-chip"
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, a.id)}
                                    >
                                        <span className="avail-name">{a.name}</span>
                                        <span className="avail-broker">{a.broker}</span>
                                        <span className="avail-drag">⠿</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Groups List ───────────────────────────── */}
            <div className="groups-list">
                {groups.length === 0 && (
                    <div className="zone-empty" style={{ padding: "48px", textAlign: "center" }}>
                        No groups yet. Create one to start configuring your trading setup.
                    </div>
                )}

                {sortedGroups.map((group) => {
                    const state = getGroupState(group);
                    const isExpanded = expandedGroup === group.id;
                    const changed = hasChanges(group);
                    const isSaving = saving === group.id;
                    const potMismatch = state.potL.length !== state.potS.length && (state.potL.length > 0 || state.potS.length > 0);

                    return (
                        <div
                            key={group.id}
                            className={`group-card ${isExpanded ? "expanded" : ""} ${changed ? "group-card-dirty" : ""}`}
                        >
                            <div className="group-card-header" onClick={() => handleToggle(group.id)}>
                                <div className="group-title-row">
                                    <span className="group-expand">{isExpanded ? "▼" : "▶"}</span>
                                    {editingId === group.id ? (
                                        <input
                                            className="inline-edit"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            onBlur={() => handleRename(group.id)}
                                            onKeyDown={(e) => e.key === "Enter" && handleRename(group.id)}
                                            onClick={(e) => e.stopPropagation()}
                                            autoFocus
                                        />
                                    ) : (
                                        <h3 className="group-name">{group.name}</h3>
                                    )}
                                    <div className="group-badges">
                                        <span className="badge badge-long">{state.potL.length} L</span>
                                        <span className="badge badge-short">{state.potS.length} S</span>
                                        {changed && <span className="badge badge-unsaved">unsaved</span>}
                                    </div>
                                </div>
                                <div className="group-actions" onClick={(e) => e.stopPropagation()}>
                                    <button
                                        className="chip-btn"
                                        onClick={() => { setEditingId(group.id); setEditName(group.name); }}
                                        title="Rename"
                                    >✏️</button>
                                    <button
                                        className="chip-btn chip-btn-del"
                                        onClick={() => handleDelete(group.id)}
                                        title="Delete"
                                    >✕</button>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="group-card-body">
                                    <div className="group-pots-row">
                                        {/* POT-L drop zone */}
                                        <div
                                            className="group-pot drop-target"
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => handleDropToPot(e, group.id, "POT-L")}
                                        >
                                            <div className="group-pot-label">
                                                <span className="pot-dot dot-long" />
                                                POT-L ({state.potL.length})
                                            </div>
                                            {state.potL.length === 0 && <div className="group-pot-empty">Drop accounts here</div>}
                                            {Object.entries(
                                                state.potL.reduce((acc, id) => {
                                                    const owner = getAccount(id)?.owner || 'Unassigned';
                                                    if (!acc[owner]) acc[owner] = [];
                                                    acc[owner].push(id);
                                                    return acc;
                                                }, {})
                                            ).sort(([a], [b]) => a.localeCompare(b)).map(([owner, ids]) => (
                                                <div key={owner} className="owner-section">
                                                    <div className="owner-header">{owner}</div>
                                                    <div className="owner-accounts">
                                                        {ids.map((id) => (
                                                            <div
                                                                key={id}
                                                                className="group-acct-chip"
                                                                draggable
                                                                onDragStart={(e) => handleDragStart(e, id)}
                                                            >
                                                                <span>{getAccountName(id)}</span>
                                                                <button className="chip-btn chip-btn-del" onClick={() => handleRemoveFromGroup(group.id, id)}>✕</button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="group-pot-divider" />

                                        {/* POT-S drop zone */}
                                        <div
                                            className="group-pot drop-target"
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => handleDropToPot(e, group.id, "POT-S")}
                                        >
                                            <div className="group-pot-label">
                                                <span className="pot-dot dot-short" />
                                                POT-S ({state.potS.length})
                                            </div>
                                            {state.potS.length === 0 && <div className="group-pot-empty">Drop accounts here</div>}
                                            {Object.entries(
                                                state.potS.reduce((acc, id) => {
                                                    const owner = getAccount(id)?.owner || 'Unassigned';
                                                    if (!acc[owner]) acc[owner] = [];
                                                    acc[owner].push(id);
                                                    return acc;
                                                }, {})
                                            ).sort(([a], [b]) => a.localeCompare(b)).map(([owner, ids]) => (
                                                <div key={owner} className="owner-section">
                                                    <div className="owner-header">{owner}</div>
                                                    <div className="owner-accounts">
                                                        {ids.map((id) => (
                                                            <div
                                                                key={id}
                                                                className="group-acct-chip"
                                                                draggable
                                                                onDragStart={(e) => handleDragStart(e, id)}
                                                            >
                                                                <span>{getAccountName(id)}</span>
                                                                <button className="chip-btn chip-btn-del" onClick={() => handleRemoveFromGroup(group.id, id)}>✕</button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Pot mismatch warning */}
                                    {potMismatch && (
                                        <div style={{
                                            display: "flex", alignItems: "center", gap: "8px",
                                            padding: "8px 14px", marginTop: "8px",
                                            background: "rgba(250, 204, 21, 0.08)",
                                            border: "1px solid rgba(250, 204, 21, 0.25)",
                                            borderRadius: "6px", fontSize: "12px",
                                            color: "#facc15"
                                        }}>
                                            ⚠️ POT-L and POT-S must have equal accounts. Currently: {state.potL.length} in POT-L, {state.potS.length} in POT-S.
                                        </div>
                                    )}

                                    {/* Save / Discard bar */}
                                    <div className="group-save-bar">
                                        {changed ? (
                                            <>
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => handleSave(group.id)}
                                                    disabled={isSaving || potMismatch}
                                                    title={potMismatch ? "Balance POT-L and POT-S before saving" : ""}
                                                >
                                                    {isSaving ? "Saving…" : "💾 Save Group"}
                                                </button>
                                                <button
                                                    className="btn btn-cancel btn-sm"
                                                    onClick={() => handleDiscard(group.id)}
                                                    disabled={isSaving}
                                                >
                                                    Discard
                                                </button>
                                            </>
                                        ) : (
                                            <span className="group-saved-label">✓ Saved</span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
