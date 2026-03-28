import { useState, useEffect, useCallback } from "react";
import { groupsApi, accountsApi } from "../api";

export default function GroupManager() {
    const [groups, setGroups] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState("");
    const [useTwoPods, setUseTwoPods] = useState(false);
    const [pod1Name, setPod1Name] = useState("Primary Pod");
    const [pod2Name, setPod2Name] = useState("Hedge Pod");
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
        const state = {};
        const pods = group.pods || ["Default"];
        pods.forEach(p => state[p] = []);
        const members = group.members || [];
        members.forEach(m => {
            if (state[m.pot]) state[m.pot].push(m.account_id);
            else state[m.pot] = [m.account_id]; // Fallback
        });
        return state;
    };

    // Check if a group has unsaved changes
    const hasChanges = (group) => {
        if (!pending[group.id]) return false;

        const serverState = {};
        const pods = group.pods || ["Default"];
        pods.forEach(p => serverState[p] = []);
        (group.members || []).forEach(m => {
            if (serverState[m.pot]) serverState[m.pot].push(m.account_id);
        });

        const pendState = pending[group.id];
        for (const p of pods) {
            const serverList = [...(serverState[p] || [])].sort().join(",");
            const pendList = [...(pendState[p] || [])].sort().join(",");
            if (serverList !== pendList) return true;
        }
        return false;
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
        const targetPot = state[pot];

        // Same-user validation: check if an account from the same user is already in this pot
        const droppedUserId = droppedAccount.user_id;
        if (droppedUserId && targetPot) {
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
        const pods = groups.find(g => g.id === groupId).pods || ["Default"];
        const newState = {};
        pods.forEach(p => {
            newState[p] = state[p] ? state[p].filter((id) => id !== accountId) : [];
        });

        if (newState[pot]) {
            newState[pot] = [...newState[pot], accountId];
        }

        setPending({ ...pending, [groupId]: newState });
    };

    const handleRemoveFromGroup = (groupId, accountId) => {
        const group = groups.find((g) => g.id === groupId);
        const state = getGroupState(group);
        const pods = group.pods || ["Default"];
        const newState = {};
        pods.forEach(p => {
            newState[p] = state[p] ? state[p].filter((id) => id !== accountId) : [];
        });
        setPending({
            ...pending,
            [groupId]: newState,
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

            // Add to pots
            for (const podName of Object.keys(state)) {
                for (const accountId of state[podName]) {
                    await groupsApi.addMember(groupId, accountId, podName);
                }
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
            const pods = useTwoPods
                ? [pod1Name.trim() || "Primary", pod2Name.trim() || "Hedge"]
                : ["Default"];

            await groupsApi.create({ name: newName.trim(), pods });
            setNewName("");
            setUseTwoPods(false);
            setPod1Name("Primary Pod");
            setPod2Name("Hedge Pod");
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
                <form onSubmit={handleCreate} className="create-group-bar" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Group name (e.g. Saurabh)"
                            style={{ flex: 1 }}
                            autoFocus
                        />
                        <button type="submit" className="btn btn-primary btn-sm">Create Group</button>
                        <button type="button" className="btn btn-cancel btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-secondary)' }}>
                        <input
                            type="checkbox"
                            checked={useTwoPods}
                            onChange={(e) => setUseTwoPods(e.target.checked)}
                            style={{ accentColor: 'var(--accent-primary)' }}
                        />
                        Enable Dual-Pod Mode (Long & Short Segregation)
                    </label>

                    {useTwoPods && (
                        <div style={{ display: 'flex', gap: '12px', width: '100%', padding: '12px', background: 'var(--bg-1)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: 'var(--accent-success)' }}>Pod 1 Name</label>
                                <input type="text" value={pod1Name} onChange={e => setPod1Name(e.target.value)} placeholder="e.g. Primary Side" style={{ width: '100%' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: 'var(--accent-danger)' }}>Pod 2 Name</label>
                                <input type="text" value={pod2Name} onChange={e => setPod2Name(e.target.value)} placeholder="e.g. Hedge Side" style={{ width: '100%' }} />
                            </div>
                        </div>
                    )}
                </form>
            )}

            {/* Stats */}
            <div className="stats-row">
                <div className="stat-pill"><span className="stat-num">{groups.length}</span> Groups</div>
                <div className="stat-pill"><span className="stat-num">{activeAccounts.length}</span> Accounts</div>
            </div>

            {/* ── Account Pool (always at top) ──────────── */}
            <div className="avail-accounts-section">
                <h4>All Accounts <small>(drag into a group's pod zone below)</small></h4>
                <div className="owner-pool-grid">
                    {activeAccounts.length === 0 && (
                        <div className="zone-empty" style={{ padding: "12px", gridColumn: "1 / -1" }}>
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
                        <div key={owner} className="owner-pool-card">
                            <div className="owner-pool-header">
                                {owner} <span className="owner-pool-count">{accounts.length}</span>
                            </div>
                            <div className="owner-pool-list">
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
                    const p1 = group.pods?.[0] || "Default";
                    const p2 = group.pods?.[1];
                    const potMismatch = p2
                        ? (state[p1]?.length || 0) !== (state[p2]?.length || 0) && ((state[p1]?.length || 0) > 0 || (state[p2]?.length || 0) > 0)
                        : false;

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
                                        {(group.pods || ["Default"]).map((pName, idx) => (
                                            <span key={pName} className={`badge ${idx === 0 ? 'badge-long' : 'badge-short'}`}>
                                                {state[pName]?.length || 0} {pName.substring(0, 1)}
                                            </span>
                                        ))}
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
                                    >🗑️</button>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="group-card-body">
                                    <div className="group-pots-row" style={{ overflowX: 'auto' }}>
                                        {/* Dynamic Pod Rendering */}
                                        {(group.pods || ["Default"]).map((podName, idx) => {
                                            const isShort = idx > 0;
                                            const potData = state[podName] || [];
                                            return (
                                                <div key={podName} style={{ display: 'flex', flex: 1, minWidth: '300px', gap: '16px' }}>
                                                    {idx > 0 && <div className="group-pot-divider" style={{ marginRight: '16px' }} />}
                                                    <div
                                                        className="group-pot drop-target"
                                                        onDragOver={handleDragOver}
                                                        onDrop={(e) => handleDropToPot(e, group.id, podName)}
                                                        style={{ flex: 1 }}
                                                    >
                                                        <div className="group-pot-label">
                                                            <span className={`pot-dot ${isShort ? 'dot-short' : 'dot-long'}`} />
                                                            {podName} ({potData.length})
                                                        </div>
                                                        {potData.length === 0 && <div className="group-pot-empty">Drop accounts here</div>}
                                                        {Object.entries(
                                                            potData.reduce((acc, id) => {
                                                                const owner = getAccount(id)?.owner || 'Unassigned';
                                                                if (!acc[owner]) acc[owner] = [];
                                                                acc[owner].push(id);
                                                                return acc;
                                                            }, {})
                                                        ).sort(([a], [b]) => a.localeCompare(b)).map(([owner, ids]) => (
                                                            <div key={owner} className="owner-pool-card" style={{ marginBottom: "8px", padding: "12px" }}>
                                                                <div className="owner-pool-header">
                                                                    {owner} <span className="owner-pool-count">{ids.length}</span>
                                                                </div>
                                                                <div className="owner-pool-list" style={{ maxHeight: "150px" }}>
                                                                    {ids.map((id) => (
                                                                        <div
                                                                            key={id}
                                                                            className="group-acct-chip"
                                                                            draggable
                                                                            onDragStart={(e) => handleDragStart(e, id)}
                                                                        >
                                                                            <span>{getAccountName(id)}</span>
                                                                            <button className="chip-btn chip-btn-del" onClick={() => handleRemoveFromGroup(group.id, id)}>🗑️</button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Pot mismatch warning (only applies to dual-pod strategies) */}
                                    {potMismatch && (group.pods?.length > 1) && (
                                        <div style={{
                                            display: "flex", alignItems: "center", gap: "8px",
                                            padding: "8px 14px", marginTop: "16px",
                                            background: "rgba(250, 204, 21, 0.08)",
                                            border: "1px solid rgba(250, 204, 21, 0.25)",
                                            borderRadius: "6px", fontSize: "12px",
                                            color: "#facc15"
                                        }}>
                                            ⚠️ Dual-pod groups work best when accounts are evenly matched. Currently unbalanced.
                                        </div>
                                    )}

                                    {/* Save / Discard bar */}
                                    <div className="group-save-bar">
                                        {changed ? (
                                            <>
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => handleSave(group.id)}
                                                    disabled={isSaving}
                                                    title={potMismatch ? "Dual-pod groups balance recommended" : ""}
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
