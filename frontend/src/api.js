const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000") + "/api";

async function request(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) {
        const msg =
            typeof data.detail === "string"
                ? data.detail
                : data.detail?.message || JSON.stringify(data.detail);
        throw new Error(msg);
    }
    return data;
}

// ── Users ──────────────────────────────────────────────────
export const usersApi = {
    list: () => request("/users/"),
    get: (id) => request(`/users/${id}`),
    create: (data) =>
        request("/users/", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) =>
        request(`/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id) => request(`/users/${id}`, { method: "DELETE" }),
    addCredential: (userId, data) =>
        request(`/users/${userId}/credentials`, { method: "POST", body: JSON.stringify(data) }),
    updateCredential: (userId, credId, data) =>
        request(`/users/${userId}/credentials/${credId}`, { method: "PUT", body: JSON.stringify(data) }),
    deleteCredential: (userId, credId) =>
        request(`/users/${userId}/credentials/${credId}`, { method: "DELETE" }),
    syncAll: (userId) =>
        request(`/users/${userId}/sync-all`, { method: "POST" }),
    getLogs: (limit = 100) => request(`/users/logs/all?limit=${limit}`),
};

// ── Accounts ───────────────────────────────────────────────
export const accountsApi = {
    list: () => request("/accounts/"),
    get: (id) => request(`/accounts/${id}`),
    create: (data) =>
        request("/accounts/", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) =>
        request(`/accounts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id) => request(`/accounts/${id}`, { method: "DELETE" }),
    flatten: (accountIds) =>
        request("/accounts/flatten", {
            method: "POST",
            body: JSON.stringify({ account_ids: accountIds }),
        }),
    syncSelected: (accountIds) =>
        request("/accounts/sync", {
            method: "POST",
            body: JSON.stringify({ account_ids: accountIds }),
        }),
};

// ── Groups ─────────────────────────────────────────────────
export const groupsApi = {
    list: () => request("/groups/"),
    get: (id) => request(`/groups/${id}`),
    create: (data) =>
        request("/groups/", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) =>
        request(`/groups/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id) => request(`/groups/${id}`, { method: "DELETE" }),
    addMember: (groupId, accountId, pot) =>
        request(`/groups/${groupId}/members`, {
            method: "POST",
            body: JSON.stringify({ account_id: accountId, pot }),
        }),
    removeMember: (groupId, accountId) =>
        request(`/groups/${groupId}/members/${accountId}`, { method: "DELETE" }),
};

// ── Instruments ────────────────────────────────────────────
export const instrumentsApi = {
    list: () => request("/instruments/"),
    get: (id) => request(`/instruments/${id}`),
    create: (data) =>
        request("/instruments/", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) =>
        request(`/instruments/${id}`, {
            method: "PUT",
            body: JSON.stringify(data),
        }),
    delete: (id) => request(`/instruments/${id}`, { method: "DELETE" }),
    sync: (userId) => request(`/instruments/sync?user_id=${userId}`, { method: "POST" }),
};

// ── Strategy (Legacy) ──────────────────────────────────────
export const strategyApi = {
    start: (data) =>
        request("/strategy/start", { method: "POST", body: JSON.stringify(data) }),
    stop: (orderId) =>
        request(`/strategy/stop/${orderId}`, { method: "POST" }),
    pause: (orderId) =>
        request(`/strategy/pause/${orderId}`, { method: "POST" }),
    resume: (orderId) =>
        request(`/strategy/resume/${orderId}`, { method: "POST" }),
    disable: (orderId) =>
        request(`/strategy/disable/${orderId}`, { method: "POST" }),
    enable: (orderId) =>
        request(`/strategy/enable/${orderId}`, { method: "POST" }),
    edit: (orderId, data) =>
        request(`/strategy/orders/${orderId}`, { method: "PUT", body: JSON.stringify(data) }),
    execute: (orderId) =>
        request(`/strategy/execute/${orderId}`, { method: "POST" }),
    orders: () => request("/strategy/orders"),
    getOrder: (id) => request(`/strategy/orders/${id}`),
    trades: (limit = 50, groupOrderId = null) => {
        let url = `/strategy/trades?limit=${limit}`;
        if (groupOrderId) url += `&group_order_id=${groupOrderId}`;
        return request(url);
    },
};

// ── Trading System (New) ───────────────────────────────────
export const tradingApi = {
    // Strategy types
    strategyTypes: () => request("/trading/strategy-types"),

    // Strategy CRUD
    deployStrategy: (data) =>
        request("/trading/strategies", { method: "POST", body: JSON.stringify(data) }),
    listStrategies: () => request("/trading/strategies"),
    startStrategy: (id) =>
        request(`/trading/strategies/${id}/start`, { method: "POST" }),
    stopStrategy: (id) =>
        request(`/trading/strategies/${id}/stop`, { method: "POST" }),
    executeStrategy: (id) =>
        request(`/trading/strategies/${id}/execute`, { method: "POST" }),

    // Orders
    listOrders: (strategyId = null, state = null, limit = 100) => {
        let url = `/trading/orders?limit=${limit}`;
        if (strategyId) url += `&strategy_id=${strategyId}`;
        if (state) url += `&state=${state}`;
        return request(url);
    },

    // Positions & Portfolio
    positions: (strategyId = null) => {
        let url = "/trading/positions";
        if (strategyId) url += `?strategy_id=${strategyId}`;
        return request(url);
    },
    portfolio: (strategyId = null) => {
        let url = "/trading/portfolio";
        if (strategyId) url += `?strategy_id=${strategyId}`;
        return request(url);
    },

    // Kill Switch
    killSwitch: (reason = "Manual") =>
        request("/trading/kill-switch", {
            method: "POST",
            body: JSON.stringify({ reason }),
        }),
    deactivateKillSwitch: () =>
        request("/trading/kill-switch/deactivate", { method: "POST" }),

    // Alerts
    alerts: (limit = 50, unreadOnly = false, severity = null) => {
        let url = `/trading/alerts?limit=${limit}`;
        if (unreadOnly) url += `&unread_only=true`;
        if (severity) url += `&severity=${severity}`;
        return request(url);
    },
    markAlertRead: (id) =>
        request(`/trading/alerts/${id}/read`, { method: "POST" }),
    markAllAlertsRead: () =>
        request("/trading/alerts/read-all", { method: "POST" }),

    // Audit Log
    auditLog: (strategyId = null, eventType = null, limit = 100) => {
        let url = `/trading/audit-log?limit=${limit}`;
        if (strategyId) url += `&strategy_id=${strategyId}`;
        if (eventType) url += `&event_type=${eventType}`;
        return request(url);
    },

    // Reconciliation
    reconcile: (accountId) =>
        request(`/trading/reconcile/${accountId}`),

    // Runner
    runnerStatus: () => request("/trading/runner/status"),
};

