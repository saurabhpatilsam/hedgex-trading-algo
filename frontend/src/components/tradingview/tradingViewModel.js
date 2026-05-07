import { getDisplayPrice, getQuoteNumber, normalizeToTick } from "../../utils/marketPrice.js";

export const TIMEFRAMES = [
  { id: "1m", label: "1m", seconds: 60 },
  { id: "3m", label: "3m", seconds: 180 },
  { id: "5m", label: "5m", seconds: 300 },
  { id: "15m", label: "15m", seconds: 900 },
  { id: "30m", label: "30m", seconds: 1800 },
  { id: "1h", label: "1h", seconds: 3600 },
  { id: "4h", label: "4h", seconds: 14400 },
  { id: "D", label: "D", seconds: 86400 },
  { id: "W", label: "W", seconds: 604800 },
  { id: "M", label: "M", seconds: 2592000 },
];

export const DEFAULT_WATCHLIST = [
  { symbol: "NQM6", root: "NQ", name: "Nasdaq 100 Micro", exchange: "CME" },
  { symbol: "MNQM6", root: "MNQ", name: "Micro Nasdaq 100", exchange: "CME" },
  { symbol: "ESM6", root: "ES", name: "E-mini S&P 500", exchange: "CME" },
  { symbol: "MESM6", root: "MES", name: "Micro E-mini S&P 500", exchange: "CME" },
  { symbol: "GCM6", root: "GC", name: "Gold Futures", exchange: "COMEX" },
  { symbol: "MGCM6", root: "MGC", name: "Micro Gold", exchange: "COMEX" },
  { symbol: "YMM6", root: "YM", name: "Dow Futures", exchange: "CBOT" },
  { symbol: "RTYM6", root: "RTY", name: "Russell 2000", exchange: "CME" },
  { symbol: "CLM6", root: "CL", name: "Crude Oil", exchange: "NYMEX" },
];

const ORDER_TYPE_MAP = {
  market: "Market",
  limit: "Limit",
  stop: "Stop",
  stoplimit: "StopLimit",
};

export function timeframeToSeconds(timeframe) {
  return TIMEFRAMES.find((item) => item.id === timeframe)?.seconds ?? 60;
}

export function normalizeOrderType(orderType) {
  const key = String(orderType || "Market").replace(/\s|_/g, "").toLowerCase();
  return ORDER_TYPE_MAP[key] ?? "Market";
}

export function getInstrumentDisplaySymbol(instrument) {
  if (!instrument) return "";
  return instrument.contract_month || instrument.symbol || instrument.name || "";
}

export function getInstrumentOrderSymbol(instrument) {
  if (!instrument) return "";
  return instrument.symbol || instrument.root || instrument.contract_month || "";
}

export function toggleAccountSelection(selectedAccountIds = [], accountId) {
  const id = Number(accountId);
  if (!Number.isFinite(id) || id <= 0) return [...selectedAccountIds];
  return selectedAccountIds.includes(id)
    ? selectedAccountIds.filter((selectedId) => selectedId !== id)
    : [...selectedAccountIds, id];
}

export function getGroupAccountIds(groups = [], selectedGroupId) {
  const groupId = Number(selectedGroupId);
  if (!Number.isFinite(groupId)) return [];
  const group = groups.find((item) => Number(item.id) === groupId);
  return (group?.members || [])
    .map((member) => Number(member.account_id ?? member.accountId ?? member.id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

export function calculateBracketPriceFromPoints({
  entryPrice,
  points,
  side,
  bracket,
  symbol,
  explicitTickSize = null,
}) {
  const entry = getQuoteNumber(entryPrice, { allowZero: true });
  const pointValue = getQuoteNumber(points, { allowZero: true });
  if (entry === null || pointValue === null) return null;

  const isBuy = String(side).toLowerCase() !== "sell";
  const isTakeProfit = bracket === "takeProfit";
  const direction = isTakeProfit === isBuy ? 1 : -1;
  return normalizeToTick(entry + direction * pointValue, symbol, explicitTickSize);
}

export function getTickTimeSeconds(tick) {
  const raw = tick?.timestamp || tick?.ts || tick?.time || tick?.updated_at || tick?.created_at;
  if (!raw) return Math.floor(Date.now() / 1000);
  if (typeof raw === "number") return raw > 9999999999 ? Math.floor(raw / 1000) : Math.floor(raw);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Date.now() / 1000);
}

export function normalizeStreamTick(rawTick, fallbackSymbol = "") {
  if (!rawTick || typeof rawTick !== "object") return null;
  const values = rawTick.v && typeof rawTick.v === "object" ? rawTick.v : rawTick;
  const symbol = rawTick.symbol || rawTick.contract_month || rawTick.n || values.symbol || fallbackSymbol;
  if (!symbol) return null;

  return {
    ...rawTick,
    ...values,
    symbol: String(symbol),
  };
}

export function toCandleSeries(candles = []) {
  return candles
    .map((item) => {
      const time = getTickTimeSeconds(item);
      const open = getQuoteNumber(item.open, { allowZero: true });
      const high = getQuoteNumber(item.high, { allowZero: true });
      const low = getQuoteNumber(item.low, { allowZero: true });
      const close = getQuoteNumber(item.close, { allowZero: true });
      const volume = getQuoteNumber(item.volume, { allowZero: true }) ?? 0;

      if ([time, open, high, low, close].some((value) => value === null)) return null;
      return { time, open, high, low, close, volume };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
}

export function aggregateTickIntoCandle(existingCandle, rawTick, options = {}) {
  const tick = normalizeStreamTick(rawTick, options.symbol);
  if (!tick) return existingCandle;

  const symbol = options.symbol || tick.symbol;
  const timeframeSeconds = options.timeframeSeconds || 60;
  const price = getDisplayPrice(tick, symbol, options.explicitTickSize);
  if (price === null) return existingCandle;

  const tickTime = getTickTimeSeconds(tick);
  const bucketTime = Math.floor(tickTime / timeframeSeconds) * timeframeSeconds;
  const volume = getQuoteNumber(tick.volume ?? tick.size ?? tick.lastSize, { allowZero: true }) ?? 0;

  if (!existingCandle || existingCandle.time !== bucketTime) {
    return {
      time: bucketTime,
      open: price,
      high: price,
      low: price,
      close: price,
      volume,
    };
  }

  return {
    ...existingCandle,
    high: Math.max(existingCandle.high, price),
    low: Math.min(existingCandle.low, price),
    close: price,
    volume: (existingCandle.volume || 0) + volume,
  };
}

export function mergeLiveCandle(candles, rawTick, options = {}) {
  const next = [...(candles || [])];
  const last = next[next.length - 1] || null;
  const updated = aggregateTickIntoCandle(last, rawTick, options);
  if (!updated) return next;
  if (last && last.time === updated.time) {
    next[next.length - 1] = updated;
  } else {
    next.push(updated);
  }
  return next.slice(-600);
}

export function ticksToCandleSeries(ticks = [], options = {}) {
  return ticks
    .map((tick) => normalizeStreamTick(tick, options.symbol))
    .filter(Boolean)
    .sort((a, b) => getTickTimeSeconds(a) - getTickTimeSeconds(b))
    .reduce((candles, tick) => mergeLiveCandle(candles, tick, options), []);
}

export function buildPanelOrderPayload({
  targetMode,
  selectedGroupId,
  selectedAccountIds,
  instrument,
  side,
  quantity,
  orderType,
  limitPrice,
  stopPrice,
  stopLossEnabled,
  stopLossPrice,
  takeProfitEnabled,
  takeProfitPrice,
  durationType,
}) {
  const normalizedOrderType = normalizeOrderType(orderType);
  const displaySymbol = getInstrumentDisplaySymbol(instrument);
  const payload = {
    instrument_symbol: getInstrumentOrderSymbol(instrument),
    action: side,
    quantity: Math.max(1, Number.parseInt(quantity, 10) || 1),
    order_type: normalizedOrderType,
    duration_type: durationType || "Day",
  };

  if (targetMode === "group") {
    payload.group_id = Number(selectedGroupId);
  } else {
    payload.account_ids = (selectedAccountIds || []).map(Number).filter(Number.isFinite);
  }

  if (normalizedOrderType === "Limit" || normalizedOrderType === "StopLimit") {
    const price = normalizeToTick(limitPrice, displaySymbol);
    if (price !== null) payload.price = price;
  }

  if (normalizedOrderType === "Stop" || normalizedOrderType === "StopLimit") {
    const stop = normalizeToTick(stopPrice, displaySymbol);
    if (stop !== null) payload.stop_price = stop;
  }

  if (stopLossEnabled) {
    const stopLoss = normalizeToTick(stopLossPrice, displaySymbol);
    if (stopLoss !== null) payload.stop_loss = stopLoss;
  }

  if (takeProfitEnabled) {
    const takeProfit = normalizeToTick(takeProfitPrice, displaySymbol);
    if (takeProfit !== null) payload.take_profit = takeProfit;
  }

  return payload;
}
