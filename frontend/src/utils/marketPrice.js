export function getQuoteNumber(value, { allowZero = false } = {}) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    if (!allowZero && number === 0) return null;
    return number;
}

export function getDisplayPrice(tick) {
    if (!tick) return null;

    const bid = getQuoteNumber(tick.bid);
    const ask = getQuoteNumber(tick.ask);
    if (bid !== null && ask !== null) {
        return (bid + ask) / 2;
    }

    return (
        getQuoteNumber(tick.price) ??
        getQuoteNumber(tick.last_price) ??
        getQuoteNumber(tick.last) ??
        getQuoteNumber(tick.lp) ??
        bid ??
        ask
    );
}

export function formatMarketPrice(value) {
    const number = getQuoteNumber(value, { allowZero: true });
    return number === null
        ? "—"
        : number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
