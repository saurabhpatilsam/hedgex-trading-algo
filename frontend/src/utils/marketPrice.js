export function getQuoteNumber(value, { allowZero = false } = {}) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    if (!allowZero && number === 0) return null;
    return number;
}

const ROOT_TICK_SIZES = {
    ES: 0.25,
    MES: 0.25,
    NQ: 0.25,
    MNQ: 0.25,
    GC: 0.1,
    MGC: 0.1,
    YM: 1,
    RTY: 0.1,
    CL: 0.01,
    SI: 0.005,
    ZB: 0.03125,
};

function getInstrumentRoot(symbol = "") {
    const clean = String(symbol).replace(/[\s-]/g, "").toUpperCase();
    return clean.replace(/[FGHJKMNQUVXZ]\d{1,2}$/i, "");
}

function countDecimals(value) {
    const text = String(value);
    if (!text.includes(".")) return 0;
    return text.split(".")[1].replace(/0+$/, "").length;
}

export function getTickSize(symbol, explicitTickSize = null) {
    const explicit = getQuoteNumber(explicitTickSize);
    if (explicit !== null) return explicit;
    return ROOT_TICK_SIZES[getInstrumentRoot(symbol)] ?? null;
}

export function normalizeToTick(value, symbol, explicitTickSize = null) {
    const number = getQuoteNumber(value, { allowZero: true });
    const tickSize = getTickSize(symbol, explicitTickSize);
    if (number === null || tickSize === null) return number;

    const precision = Math.max(2, countDecimals(tickSize));
    const rounded = Math.round(number / tickSize) * tickSize;
    return Number(rounded.toFixed(precision));
}

export function getDisplayPrice(tick, symbol, explicitTickSize = null) {
    if (!tick) return null;

    const price = (
        getQuoteNumber(tick.price) ??
        getQuoteNumber(tick.last_price) ??
        getQuoteNumber(tick.last) ??
        getQuoteNumber(tick.lp) ??
        getQuoteNumber(tick.bid) ??
        getQuoteNumber(tick.ask)
    );
    return normalizeToTick(price, symbol ?? tick.symbol, explicitTickSize);
}

export function formatMarketPrice(value, symbol, explicitTickSize = null) {
    const number = normalizeToTick(value, symbol, explicitTickSize);
    return number === null
        ? "—"
        : number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
