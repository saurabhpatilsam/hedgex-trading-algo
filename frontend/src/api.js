const API_BASE = "http://localhost:8000/api";

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

// ── Accounts ───────────────────────────────────────────────
export const accountsApi = {
    list: () => request("/accounts/"),
    get: (id) => request(`/accounts/${id}`),
    create: (data) =>
        request("/accounts/", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) =>
        request(`/accounts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id) => request(`/accounts/${id}`, { method: "DELETE" }),
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
};

// ── Strategy ───────────────────────────────────────────────
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
