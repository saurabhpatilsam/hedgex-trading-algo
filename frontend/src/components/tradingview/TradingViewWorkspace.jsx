import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CandlestickSeries, ColorType, CrosshairMode, createChart } from "lightweight-charts";
import {
  accountsApi,
  brokerApi,
  groupsApi,
  instrumentsApi,
  marketApi,
  marketDataApi,
  panelApi,
} from "../../api";
import {
  formatMarketPrice,
  getDisplayPrice,
  getPriceSnapshotSignature,
  getQuoteNumber,
  getTickSize,
  normalizeToTick,
} from "../../utils/marketPrice";
import {
  DEFAULT_WATCHLIST,
  TIMEFRAMES,
  buildPanelOrderPayload,
  calculateBracketPriceFromPoints,
  getGroupAccountIds,
  getInstrumentDisplaySymbol,
  isPriceStreamFresh,
  mergeLiveCandle,
  normalizeOrderType,
  normalizeStreamTick,
  toggleAccountSelection,
  ticksToCandleSeries,
  timeframeToSeconds,
  toCandleSeries,
} from "./tradingViewModel";
import "./TradingViewWorkspace.css";

const TOOLBAR_TOOLS = [
  { id: "cursor", label: "Cursor", mark: "+" },
  { id: "line", label: "Trend line", mark: "/" },
  { id: "hline", label: "Horizontal line", mark: "-" },
  { id: "measure", label: "Measure", mark: "M" },
  { id: "text", label: "Text", mark: "T" },
  { id: "zoom", label: "Zoom", mark: "Z" },
  { id: "order", label: "Order from chart", mark: "O" },
  { id: "lock", label: "Lock", mark: "L" },
  { id: "delete", label: "Delete", mark: "X" },
];

const ORDER_TYPES = ["Market", "Limit", "Stop", "Stop Limit"];
const TERMINAL_TABS = ["Positions", "Orders", "Executions", "Account"];
const REDIS_FALLBACK_POLL_MS = 1000;
const STREAM_STALE_MS = 2500;
const PRICE_TARGETS = {
  limitPrice: "Limit",
  stopPrice: "Stop",
  takeProfitPrice: "Take profit",
  stopLossPrice: "Stop loss",
};

function compactNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return number.toLocaleString();
}

function toBackendTimeframe(timeframe) {
  if (timeframe === "D" || timeframe === "W" || timeframe === "M") return "1d";
  return timeframe;
}

function candleLookbackMs(timeframe) {
  const seconds = timeframeToSeconds(timeframe);
  if (seconds >= 86400) return 180 * 24 * 60 * 60 * 1000;
  if (seconds >= 3600) return 21 * 24 * 60 * 60 * 1000;
  return 3 * 24 * 60 * 60 * 1000;
}

function getAccountTvId(account) {
  return account?.tv_account_id || account?.tradovate_account_id || account?.id || null;
}

function getOrderDisplayType(orderType) {
  return normalizeOrderType(orderType) === "StopLimit" ? "Stop Limit" : normalizeOrderType(orderType);
}

function formatAccountName(name = "") {
  return name && name.length > 12 ? `${name.slice(0, 5)}...${name.slice(-4)}` : name;
}

export default function TradingViewWorkspace() {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const streamRef = useRef(null);
  const candlesRef = useRef([]);
  const lastPriceUpdateRef = useRef(0);
  const priceSnapshotSignatureRef = useRef("");

  const [activeTool, setActiveTool] = useState("cursor");
  const [activeSymbol, setActiveSymbol] = useState(DEFAULT_WATCHLIST[0].symbol);
  const [activeTimeframe, setActiveTimeframe] = useState("1m");
  const [prices, setPrices] = useState({});
  const [candles, setCandles] = useState([]);
  const [chartStatus, setChartStatus] = useState("Loading chart data");
  const [streamConnected, setStreamConnected] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);

  const [instruments, setInstruments] = useState([]);
  const [localAccounts, setLocalAccounts] = useState([]);
  const [brokerAccounts, setBrokerAccounts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [targetMode, setTargetMode] = useState("accounts");
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");

  const [side, setSide] = useState("Buy");
  const [orderType, setOrderType] = useState("Limit");
  const [quantity, setQuantity] = useState(1);
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [activePriceTarget, setActivePriceTarget] = useState("limitPrice");
  const [stopLossEnabled, setStopLossEnabled] = useState(false);
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [stopLossMode, setStopLossMode] = useState("price");
  const [stopLossPoints, setStopLossPoints] = useState("");
  const [takeProfitEnabled, setTakeProfitEnabled] = useState(false);
  const [takeProfitPrice, setTakeProfitPrice] = useState("");
  const [takeProfitMode, setTakeProfitMode] = useState("price");
  const [takeProfitPoints, setTakeProfitPoints] = useState("");
  const [durationType, setDurationType] = useState("Day");
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderMessage, setOrderMessage] = useState(null);

  const [terminalTab, setTerminalTab] = useState("Positions");
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [accountState, setAccountState] = useState(null);

  const activeInstrument = useMemo(() => {
    const exact = instruments.find((item) => item.contract_month === activeSymbol || item.symbol === activeSymbol);
    if (exact) return exact;
    const watch = DEFAULT_WATCHLIST.find((item) => item.symbol === activeSymbol);
    return {
      symbol: watch?.root || activeSymbol.replace(/[FGHJKMNQUVXZ]\d{1,2}$/i, ""),
      contract_month: activeSymbol,
      name: watch?.name || activeSymbol,
      tick_size: getTickSize(activeSymbol),
    };
  }, [activeSymbol, instruments]);

  const activeTickSize = activeInstrument?.tick_size ?? getTickSize(activeSymbol) ?? 0.25;
  const activePriceTick = prices[activeSymbol];
  const activeLast = getDisplayPrice(activePriceTick, activeSymbol, activeTickSize);
  const activeBid = getQuoteNumber(activePriceTick?.bid) ?? activeLast;
  const activeAsk = getQuoteNumber(activePriceTick?.ask) ?? activeLast;
  const selectedAccount = localAccounts.find((account) => account.id === selectedAccountIds[0])
    || localAccounts.find((account) => selectedAccountIds.includes(account.id));
  const selectedTvAccountId = getAccountTvId(selectedAccount);
  const selectedAccounts = useMemo(
    () => selectedAccountIds
      .map((id) => localAccounts.find((account) => account.id === id))
      .filter(Boolean),
    [selectedAccountIds, localAccounts]
  );

  const watchlist = useMemo(() => {
    const fromInstruments = instruments
      .map((item) => ({
        symbol: item.contract_month || item.symbol,
        root: item.symbol,
        name: item.name || item.symbol,
        exchange: item.exchange || "CME",
      }))
      .filter((item) => item.symbol);

    const merged = [...DEFAULT_WATCHLIST, ...fromInstruments];
    return merged
      .filter((item, index, list) => list.findIndex((other) => other.symbol === item.symbol) === index)
      .slice(0, 6);
  }, [instruments]);

  useEffect(() => {
    Promise.all([
      instrumentsApi.list().catch(() => []),
      accountsApi.list().catch(() => []),
      brokerApi.accounts().catch(() => []),
      groupsApi.list().catch(() => []),
      marketApi.prices().catch(() => ({ prices: {} })),
    ]).then(([instrumentRows, accountRows, brokerRows, groupRows, priceRows]) => {
      setInstruments(Array.isArray(instrumentRows) ? instrumentRows : []);
      setLocalAccounts(Array.isArray(accountRows) ? accountRows : []);
      setBrokerAccounts(Array.isArray(brokerRows) ? brokerRows : []);
      setGroups(Array.isArray(groupRows) ? groupRows : []);
      setPrices(priceRows?.prices || {});

      if (accountRows?.length) {
        setSelectedAccountIds((current) => current.length ? current : [accountRows[0].id]);
      }
    });
  }, []);

  useEffect(() => {
    if (targetMode !== "group") return;
    setSelectedAccountIds(getGroupAccountIds(groups, selectedGroupId));
  }, [targetMode, selectedGroupId, groups]);

  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#000000" },
        textColor: "#c9d0dc",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(80, 90, 110, 0.18)" },
        horzLines: { color: "rgba(80, 90, 110, 0.18)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(146, 169, 206, 0.65)", style: 2, width: 1 },
        horzLine: { color: "rgba(146, 169, 206, 0.65)", style: 2, width: 1 },
      },
      rightPriceScale: {
        borderColor: "#363a45",
        entireTextOnly: true,
      },
      timeScale: {
        borderColor: "#363a45",
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        priceFormatter: (price) => formatMarketPrice(price),
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#a7f3d0",
      wickDownColor: "#fca5a5",
      priceFormat: {
        type: "custom",
        formatter: (price) => formatMarketPrice(price),
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    seriesRef.current.applyOptions({
      priceFormat: {
        type: "custom",
        formatter: (price) => formatMarketPrice(price, activeSymbol, activeTickSize),
      },
    });
    chartRef.current.applyOptions({
      localization: {
        priceFormatter: (price) => formatMarketPrice(price, activeSymbol, activeTickSize),
      },
    });
  }, [activeSymbol, activeTickSize]);

  useEffect(() => {
    let cancelled = false;
    const end = new Date();
    const start = new Date(end.getTime() - candleLookbackMs(activeTimeframe));

    setChartStatus("Loading chart data");
    marketDataApi
      .candles({
        symbol: activeSymbol,
        timeframe: toBackendTimeframe(activeTimeframe),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        limit: 1200,
      })
      .then((res) => {
        if (cancelled) return;
        const rows = toCandleSeries(res?.candles || []);
        if (rows.length) return rows;
        return marketApi.ticks(activeSymbol, 800).then((tickRes) =>
          ticksToCandleSeries(tickRes?.ticks || [], {
            symbol: activeSymbol,
            timeframeSeconds: timeframeToSeconds(activeTimeframe),
            explicitTickSize: activeTickSize,
          })
        );
      })
      .then((rows = []) => {
        if (cancelled) return;
        candlesRef.current = rows;
        setCandles(rows);
        seriesRef.current?.setData(rows);
        chartRef.current?.timeScale().fitContent();
        setChartStatus(rows.length ? "Redis stream active" : "Waiting for Redis ticks");
      })
      .catch((error) => {
        if (!cancelled) {
          candlesRef.current = [];
          setCandles([]);
          seriesRef.current?.setData([]);
          setChartStatus(error.message || "Chart data unavailable");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSymbol, activeTimeframe, activeTickSize]);

  const applyLiveTick = useCallback((rawTick) => {
    const tick = normalizeStreamTick(rawTick);
    if (!tick?.symbol) return;

    setPrices((prev) => {
      const next = { ...prev, [tick.symbol]: { ...(prev[tick.symbol] || {}), ...tick } };
      priceSnapshotSignatureRef.current = getPriceSnapshotSignature(next);
      return next;
    });
    lastPriceUpdateRef.current = Date.now();
    if (tick.symbol !== activeSymbol) return;

    candlesRef.current = mergeLiveCandle(candlesRef.current, tick, {
      symbol: activeSymbol,
      timeframeSeconds: timeframeToSeconds(activeTimeframe),
      explicitTickSize: activeTickSize,
    });
    setCandles(candlesRef.current);
    const last = candlesRef.current[candlesRef.current.length - 1];
    if (last) seriesRef.current?.update(last);
    setChartStatus("Redis stream active");
  }, [activeSymbol, activeTimeframe, activeTickSize]);

  const applyPriceSnapshot = useCallback((nextPrices, liveStatus) => {
    const signature = getPriceSnapshotSignature(nextPrices);
    if (!signature) return false;

    setPrices(nextPrices);
    if (signature !== priceSnapshotSignatureRef.current) {
      priceSnapshotSignatureRef.current = signature;
      lastPriceUpdateRef.current = Date.now();
      setChartStatus(liveStatus);
      return true;
    }

    setChartStatus("Redis snapshot stale; waiting for ticks");
    return false;
  }, []);

  useEffect(() => {
    const ws = new WebSocket(marketApi.wsUrl());
    streamRef.current = ws;

    ws.onopen = () => {
      setStreamConnected(true);
      setChartStatus("Redis Pub/Sub websocket active");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "snapshot" && data.prices) {
          applyPriceSnapshot(data.prices, "Redis snapshot loaded");
          return;
        }
        if (data.type === "error") {
          setChartStatus(data.error ? `Redis stream error: ${data.error}` : "Redis stream error");
          return;
        }
        const tick = data.type === "price_update"
          ? { ...(data.data || {}), symbol: data.symbol }
          : data.tick || data;
        applyLiveTick(tick);
      } catch {
        /* ignore malformed stream frames */
      }
    };

    ws.onerror = () => {
      setStreamConnected(false);
      setChartStatus("Redis stream reconnecting");
    };
    ws.onclose = () => {
      setStreamConnected(false);
      setChartStatus("Redis stream reconnecting");
    };
    return () => {
      ws.close();
      setStreamConnected(false);
    };
  }, [applyLiveTick, applyPriceSnapshot]);

  useEffect(() => {
    const id = setInterval(async () => {
      if (isPriceStreamFresh({
        connected: streamConnected,
        lastUpdateMs: lastPriceUpdateRef.current,
        staleMs: STREAM_STALE_MS,
      })) {
        return;
      }

      try {
        const data = await marketApi.prices();
        if (data?.prices && Object.keys(data.prices).length) {
          applyPriceSnapshot(
            data.prices,
            streamConnected ? "Redis snapshot fallback active" : "Redis snapshot polling"
          );
          return;
        }

        await Promise.all(watchlist.map(async (item) => {
          const quote = await marketApi.liveQuote(item.symbol).catch(() => null);
          if (!quote || getDisplayPrice(quote, item.symbol) == null) return;
          const symbol = quote.symbol || item.symbol;
          setPrices((prev) => ({ ...prev, [symbol]: { ...(prev[symbol] || {}), ...quote } }));
          lastPriceUpdateRef.current = Date.now();
          setChartStatus("Redis quote fallback active");
        }));
      } catch {
        setChartStatus("Waiting for Redis Pub/Sub prices");
      }
    }, REDIS_FALLBACK_POLL_MS);

    return () => clearInterval(id);
  }, [applyPriceSnapshot, streamConnected, watchlist]);

  const getTicketEntryPrice = useCallback(() => {
    const normalizedType = normalizeOrderType(orderType);
    if (normalizedType === "Limit" || normalizedType === "StopLimit") {
      const price = getQuoteNumber(limitPrice, { allowZero: true });
      if (price !== null) return price;
    }
    if (normalizedType === "Stop") {
      const price = getQuoteNumber(stopPrice, { allowZero: true });
      if (price !== null) return price;
    }
    return activeLast;
  }, [activeLast, limitPrice, orderType, stopPrice]);

  const writeSnappedPrice = useCallback((target, rawPrice) => {
    const snapped = normalizeToTick(rawPrice, activeSymbol, activeTickSize);
    const textPrice = snapped == null ? "" : String(snapped);
    if (!textPrice) return;

    if (target === "stopPrice") setStopPrice(textPrice);
    else if (target === "takeProfitPrice") {
      setTakeProfitEnabled(true);
      setTakeProfitMode("price");
      setTakeProfitPrice(textPrice);
    } else if (target === "stopLossPrice") {
      setStopLossEnabled(true);
      setStopLossMode("price");
      setStopLossPrice(textPrice);
    } else {
      setLimitPrice(textPrice);
    }
  }, [activeSymbol, activeTickSize]);

  const fillActivePriceTarget = useCallback((rawPrice) => {
    writeSnappedPrice(activePriceTarget, rawPrice);
  }, [activePriceTarget, writeSnappedPrice]);

  useEffect(() => {
    if (!takeProfitEnabled || takeProfitMode !== "points" || takeProfitPoints === "") return;
    const price = calculateBracketPriceFromPoints({
      entryPrice: getTicketEntryPrice(),
      points: takeProfitPoints,
      side,
      bracket: "takeProfit",
      symbol: activeSymbol,
      explicitTickSize: activeTickSize,
    });
    if (price !== null) setTakeProfitPrice(String(price));
  }, [activeSymbol, activeTickSize, getTicketEntryPrice, side, takeProfitEnabled, takeProfitMode, takeProfitPoints]);

  useEffect(() => {
    if (!stopLossEnabled || stopLossMode !== "points" || stopLossPoints === "") return;
    const price = calculateBracketPriceFromPoints({
      entryPrice: getTicketEntryPrice(),
      points: stopLossPoints,
      side,
      bracket: "stopLoss",
      symbol: activeSymbol,
      explicitTickSize: activeTickSize,
    });
    if (price !== null) setStopLossPrice(String(price));
  }, [activeSymbol, activeTickSize, getTicketEntryPrice, side, stopLossEnabled, stopLossMode, stopLossPoints]);

  useEffect(() => {
    const loadOrdersAndPositions = () => {
      if (!selectedTvAccountId) return;
      Promise.all([
        brokerApi.positions(selectedTvAccountId).catch(() => []),
        brokerApi.orders(selectedTvAccountId).catch(() => []),
      ]).then(([positionRows, orderRows]) => {
        setPositions(Array.isArray(positionRows) ? positionRows : positionRows?.positions || []);
        setOrders(Array.isArray(orderRows) ? orderRows : orderRows?.orders || []);
      });
    };

    loadOrdersAndPositions();
    const id = setInterval(loadOrdersAndPositions, 1000);
    return () => clearInterval(id);
  }, [selectedTvAccountId]);

  useEffect(() => {
    const loadAccountState = () => {
      if (!selectedTvAccountId) return;
      brokerApi.accountState(selectedTvAccountId).then(setAccountState).catch(() => setAccountState(null));
    };

    loadAccountState();
    const id = setInterval(loadAccountState, 1500);
    return () => clearInterval(id);
  }, [selectedTvAccountId]);

  useEffect(() => {
    if (!selectedTvAccountId || terminalTab !== "Executions") return;
    brokerApi.executions(selectedTvAccountId, activeSymbol).then((rows) => {
      setExecutions(Array.isArray(rows) ? rows : []);
    }).catch(() => setExecutions([]));
  }, [selectedTvAccountId, terminalTab, activeSymbol]);

  const setTicketFromChart = useCallback((nextSide, nextType, rawPrice) => {
    const snapped = normalizeToTick(rawPrice, activeSymbol, activeTickSize);
    const textPrice = snapped == null ? "" : String(snapped);

    setSide(nextSide);
    setOrderType(nextType);
    if (normalizeOrderType(nextType) === "Limit" || normalizeOrderType(nextType) === "StopLimit") {
      setLimitPrice(textPrice);
    }
    if (normalizeOrderType(nextType) === "Stop" || normalizeOrderType(nextType) === "StopLimit") {
      setStopPrice(textPrice);
    }
    setContextMenu(null);
  }, [activeSymbol, activeTickSize]);

  const openChartMenu = useCallback((event) => {
    event.preventDefault();
    const rect = chartContainerRef.current?.getBoundingClientRect();
    const series = seriesRef.current;
    if (!rect || !series) return;
    const y = event.clientY - rect.top;
    const rawPrice = series.coordinateToPrice(y);
    if (rawPrice == null) return;

    setContextMenu({
      x: event.clientX - rect.left,
      y,
      price: normalizeToTick(rawPrice, activeSymbol, activeTickSize),
    });
  }, [activeSymbol, activeTickSize]);

  const handleChartClick = useCallback((event) => {
    if (activeTool === "order") openChartMenu(event);
  }, [activeTool, openChartMenu]);

  const handleAccountToggle = useCallback((accountId) => {
    setTargetMode("accounts");
    setSelectedGroupId("");
    setSelectedAccountIds((current) => toggleAccountSelection(current, accountId));
  }, []);

  const handleGroupChange = useCallback((groupId) => {
    setTargetMode("group");
    setSelectedGroupId(groupId);
    setSelectedAccountIds(getGroupAccountIds(groups, groupId));
  }, [groups]);

  const submitOrder = async (nextSide = side) => {
    setOrderBusy(true);
    setOrderMessage(null);
    try {
      const payload = buildPanelOrderPayload({
        targetMode,
        selectedGroupId,
        selectedAccountIds,
        instrument: activeInstrument,
        side: nextSide,
        quantity,
        orderType,
        limitPrice,
        stopPrice,
        stopLossEnabled,
        stopLossPrice,
        takeProfitEnabled,
        takeProfitPrice,
        durationType,
      });

      const targetReady = targetMode === "group" ? payload.group_id : payload.account_ids?.length;
      if (!targetReady) throw new Error("Select an account or group first.");
      if (!payload.instrument_symbol) throw new Error("Select an instrument first.");
      if ((payload.order_type === "Limit" || payload.order_type === "StopLimit") && payload.price == null) {
        throw new Error("Enter a limit price.");
      }
      if ((payload.order_type === "Stop" || payload.order_type === "StopLimit") && payload.stop_price == null) {
        throw new Error("Enter a stop price.");
      }

      const result = await panelApi.placeOrder(payload);
      setOrderMessage({
        type: result?.fail_count ? "warning" : "success",
        text: `Order sent: ${payload.action} ${payload.quantity} ${payload.instrument_symbol}`,
      });
    } catch (error) {
      setOrderMessage({ type: "error", text: error.message || "Order failed" });
    } finally {
      setOrderBusy(false);
    }
  };

  const renderTerminalRows = () => {
    if (terminalTab === "Positions") {
      return positions.length ? positions.map((item, index) => (
        <tr key={`${item.id || item.instrument || "pos"}-${index}`}>
          <td>{item.instrument || item.symbol || "-"}</td>
          <td>{item.side || (item.qty > 0 ? "Long" : "Short")}</td>
          <td>{Math.abs(item.qty ?? item.netPos ?? 0)}</td>
          <td>{formatMarketPrice(item.avgPrice ?? item.price, item.instrument || activeSymbol)}</td>
          <td className={(item.unrealizedPl ?? 0) >= 0 ? "tv-positive" : "tv-negative"}>
            {Number(item.unrealizedPl ?? 0).toFixed(2)}
          </td>
        </tr>
      )) : <tr><td colSpan="5">No open positions</td></tr>;
    }

    if (terminalTab === "Orders") {
      return orders.length ? orders.map((item, index) => (
        <tr key={`${item.id || item.orderId || "ord"}-${index}`}>
          <td>{item.instrument || item.symbol || "-"}</td>
          <td>{item.side || item.action || "-"}</td>
          <td>{item.orderType || item.type || "-"}</td>
          <td>{item.status || item.state || "-"}</td>
          <td>{formatMarketPrice(item.price ?? item.stopPrice ?? item.avgPrice, item.instrument || activeSymbol)}</td>
        </tr>
      )) : <tr><td colSpan="5">No working orders</td></tr>;
    }

    if (terminalTab === "Executions") {
      return executions.length ? executions.map((item, index) => (
        <tr key={`${item.id || "exec"}-${index}`}>
          <td>{item.instrument || item.symbol || "-"}</td>
          <td>{item.side || "-"}</td>
          <td>{item.qty ?? item.quantity ?? "-"}</td>
          <td>{formatMarketPrice(item.price ?? item.fillPrice, item.instrument || activeSymbol)}</td>
          <td>{item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : "-"}</td>
        </tr>
      )) : <tr><td colSpan="5">No executions loaded</td></tr>;
    }

    return (
      <>
        <tr>
          <td>Balance</td>
          <td>{formatMarketPrice(accountState?.balance, activeSymbol)}</td>
          <td>Equity</td>
          <td>{formatMarketPrice(accountState?.equity, activeSymbol)}</td>
          <td>{accountState?._currency || "USD"}</td>
        </tr>
        <tr>
          <td>Open P/L</td>
          <td className={(accountState?.unrealizedPl ?? 0) >= 0 ? "tv-positive" : "tv-negative"}>
            {Number(accountState?.unrealizedPl ?? 0).toFixed(2)}
          </td>
          <td>Account</td>
          <td>{selectedAccount?.name || selectedTvAccountId || "-"}</td>
          <td>{brokerAccounts.length} broker accounts</td>
        </tr>
      </>
    );
  };

  return (
    <section className="tv-workspace">
      <header className="tv-topbar">
        <div className="tv-symbol-chip">
          <span className="tv-symbol-main">{activeSymbol}</span>
          <span className="tv-symbol-sub">{activeInstrument?.name || "Futures"}</span>
        </div>

        <div className="tv-timeframes" role="tablist" aria-label="Chart timeframes">
          {TIMEFRAMES.map((frame) => (
            <button
              key={frame.id}
              type="button"
              className={activeTimeframe === frame.id ? "active" : ""}
              onClick={() => setActiveTimeframe(frame.id)}
            >
              {frame.label}
            </button>
          ))}
        </div>

        <div className="tv-top-actions">
          <span className="tv-status-dot" />
          <span>{chartStatus}</span>
          <button type="button" className="tv-trade-button" onClick={() => submitOrder(side)} disabled={orderBusy}>
            Trade
          </button>
        </div>
      </header>

      <div className="tv-body">
        <aside className="tv-left-tools" aria-label="Chart tools">
          {TOOLBAR_TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              title={tool.label}
              className={activeTool === tool.id ? "active" : ""}
              onClick={() => setActiveTool(tool.id)}
            >
              {tool.mark}
            </button>
          ))}
        </aside>

        <aside className="tv-trade-rail">
          <div className="tv-order-ticket">
            <div className="tv-ticket-head">
              <strong>{activeSymbol}</strong>
              <span>{getOrderDisplayType(orderType)}</span>
            </div>

            <div className="tv-live-prices" aria-label="Live prices">
              {[
                ["Last", activeLast],
                ["Bid", activeBid],
                ["Ask", activeAsk],
              ].map(([label, value]) => (
                <button key={label} type="button" onClick={() => fillActivePriceTarget(value)}>
                  <span>{label}</span>
                  <strong>{formatMarketPrice(value, activeSymbol, activeTickSize)}</strong>
                </button>
              ))}
              <small>Fill {PRICE_TARGETS[activePriceTarget]}</small>
            </div>

            <div className="tv-side-toggle">
              <button type="button" className={side === "Sell" ? "sell active" : "sell"} onClick={() => setSide("Sell")}>Sell</button>
              <button type="button" className={side === "Buy" ? "buy active" : "buy"} onClick={() => setSide("Buy")}>Buy</button>
            </div>

            <div className="tv-order-types">
              {ORDER_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={orderType === type ? "active" : ""}
                  onClick={() => setOrderType(type)}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="tv-target-tabs">
              <button type="button" className={targetMode === "accounts" ? "active" : ""} onClick={() => setTargetMode("accounts")}>Accounts</button>
              <button type="button" className={targetMode === "group" ? "active" : ""} onClick={() => setTargetMode("group")}>Group</button>
            </div>

            {targetMode === "accounts" ? (
              <div className="tv-account-list" aria-label="Trading accounts">
                {localAccounts.length ? localAccounts.map((account) => {
                  const selected = selectedAccountIds.includes(account.id);
                  const hasDrawdown = Number(account.drawdown_limit) > 0;
                  const buffer = hasDrawdown ? Number(account.balance || 0) - Number(account.drawdown_limit || 0) : null;
                  return (
                    <label key={account.id} className={`tv-account-choice ${selected ? "selected" : ""}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => handleAccountToggle(account.id)}
                      />
                      <span title={account.name}>{formatAccountName(account.name)}</span>
                      <small>{account.owner || "Account"}</small>
                      <strong>{hasDrawdown ? `$${buffer.toFixed(0)}` : "—"}</strong>
                    </label>
                  );
                }) : <div className="tv-empty-small">No accounts loaded</div>}
              </div>
            ) : (
              <label className="tv-field">
                <span>Group</span>
                <select value={selectedGroupId} onChange={(event) => handleGroupChange(event.target.value)}>
                  <option value="">Select group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="tv-selected-accounts">
              <span>Accounts to trade</span>
              <div>
                {selectedAccounts.length ? selectedAccounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    title={targetMode === "group" ? "Group-selected account" : "Remove account"}
                    onClick={() => targetMode === "accounts" && handleAccountToggle(account.id)}
                  >
                    {formatAccountName(account.name)}
                  </button>
                )) : <small>No accounts selected</small>}
              </div>
            </div>

            <label className="tv-field">
              <span>Units</span>
              <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </label>

            {(normalizeOrderType(orderType) === "Limit" || normalizeOrderType(orderType) === "StopLimit") && (
              <label className="tv-field">
                <span>Limit price</span>
                <input
                  value={limitPrice}
                  onFocus={() => setActivePriceTarget("limitPrice")}
                  onChange={(event) => setLimitPrice(event.target.value)}
                  placeholder={formatMarketPrice(activeLast, activeSymbol, activeTickSize)}
                />
              </label>
            )}

            {(normalizeOrderType(orderType) === "Stop" || normalizeOrderType(orderType) === "StopLimit") && (
              <label className="tv-field">
                <span>Stop price</span>
                <input
                  value={stopPrice}
                  onFocus={() => setActivePriceTarget("stopPrice")}
                  onChange={(event) => setStopPrice(event.target.value)}
                  placeholder={formatMarketPrice(activeLast, activeSymbol, activeTickSize)}
                />
              </label>
            )}

            <div className="tv-bracket-card">
              <label className="tv-bracket-toggle">
                <input type="checkbox" checked={takeProfitEnabled} onChange={(event) => setTakeProfitEnabled(event.target.checked)} />
                Take profit
              </label>
              <div className="tv-bracket-inputs">
                <select disabled={!takeProfitEnabled} value={takeProfitMode} onChange={(event) => setTakeProfitMode(event.target.value)}>
                  <option value="price">Price</option>
                  <option value="points">Points</option>
                </select>
                <input
                  disabled={!takeProfitEnabled}
                  value={takeProfitMode === "points" ? takeProfitPoints : takeProfitPrice}
                  onFocus={() => setActivePriceTarget("takeProfitPrice")}
                  onChange={(event) => takeProfitMode === "points" ? setTakeProfitPoints(event.target.value) : setTakeProfitPrice(event.target.value)}
                  placeholder={takeProfitMode === "points" ? "Points" : "Price"}
                />
              </div>
              {takeProfitEnabled && takeProfitMode === "points" && <small>Target {formatMarketPrice(takeProfitPrice, activeSymbol, activeTickSize)}</small>}

              <label className="tv-bracket-toggle">
                <input type="checkbox" checked={stopLossEnabled} onChange={(event) => setStopLossEnabled(event.target.checked)} />
                Stop loss
              </label>
              <div className="tv-bracket-inputs">
                <select disabled={!stopLossEnabled} value={stopLossMode} onChange={(event) => setStopLossMode(event.target.value)}>
                  <option value="price">Price</option>
                  <option value="points">Points</option>
                </select>
                <input
                  disabled={!stopLossEnabled}
                  value={stopLossMode === "points" ? stopLossPoints : stopLossPrice}
                  onFocus={() => setActivePriceTarget("stopLossPrice")}
                  onChange={(event) => stopLossMode === "points" ? setStopLossPoints(event.target.value) : setStopLossPrice(event.target.value)}
                  placeholder={stopLossMode === "points" ? "Points" : "Price"}
                />
              </div>
              {stopLossEnabled && stopLossMode === "points" && <small>Stop {formatMarketPrice(stopLossPrice, activeSymbol, activeTickSize)}</small>}
            </div>

            <label className="tv-field">
              <span>Time in force</span>
              <select value={durationType} onChange={(event) => setDurationType(event.target.value)}>
                <option value="Day">Day</option>
                <option value="GTC">GTC</option>
              </select>
            </label>

            {orderMessage && <div className={`tv-order-message ${orderMessage.type}`}>{orderMessage.text}</div>}

            <button type="button" className="tv-submit-order" onClick={() => submitOrder(side)} disabled={orderBusy}>
              {orderBusy ? "Sending order" : `Start creating ${side.toLowerCase()} order`}
            </button>
          </div>
        </aside>

        <main className="tv-chart-panel">
          <div className="tv-horizontal-watchlist" aria-label="Horizontal watchlist">
            {watchlist.map((item) => {
              const tick = prices[item.symbol];
              const last = getDisplayPrice(tick, item.symbol);
              const bid = getQuoteNumber(tick?.bid);
              const ask = getQuoteNumber(tick?.ask);
              const change = getQuoteNumber(tick?.change, { allowZero: true }) ?? 0;
              return (
                <button
                  key={item.symbol}
                  type="button"
                  className={`tv-watch-card ${activeSymbol === item.symbol ? "active" : ""}`}
                  onClick={() => setActiveSymbol(item.symbol)}
                >
                  <span>{item.symbol}</span>
                  <strong>{formatMarketPrice(last, item.symbol)}</strong>
                  <small>B {formatMarketPrice(bid, item.symbol)} · A {formatMarketPrice(ask, item.symbol)}</small>
                  <em className={change >= 0 ? "tv-positive" : "tv-negative"}>{change >= 0 ? "+" : ""}{change.toFixed(2)} · Vol {compactNumber(tick?.volume)}</em>
                </button>
              );
            })}
          </div>

          <div className="tv-chart-titlebar">
            <div>
              <div className="tv-chart-title">{activeInstrument?.name || activeSymbol}</div>
              <div className="tv-chart-meta">{activeTimeframe} - CME - Redis market stream</div>
            </div>
            <div className="tv-bbo">
              <button className="sell" type="button" onClick={() => { setSide("Sell"); fillActivePriceTarget(activeBid); }}>
                <span>{formatMarketPrice(activeBid, activeSymbol, activeTickSize)}</span>
                <strong>SELL</strong>
              </button>
              <span className="tv-spread">{activeAsk && activeBid ? formatMarketPrice(activeAsk - activeBid, activeSymbol, activeTickSize) : "-"}</span>
              <button className="buy" type="button" onClick={() => { setSide("Buy"); fillActivePriceTarget(activeAsk); }}>
                <span>{formatMarketPrice(activeAsk, activeSymbol, activeTickSize)}</span>
                <strong>BUY</strong>
              </button>
            </div>
          </div>

          <div
            ref={chartContainerRef}
            className="tv-chart-canvas"
            onContextMenu={openChartMenu}
            onClick={handleChartClick}
          >
            {!candles.length && <div className="tv-chart-empty">{chartStatus}</div>}
            {contextMenu && (
              <div className="tv-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
                <div className="tv-context-price">{formatMarketPrice(contextMenu.price, activeSymbol, activeTickSize)}</div>
                <button type="button" onClick={() => setTicketFromChart("Buy", "Market", contextMenu.price)}>Buy market</button>
                <button type="button" onClick={() => setTicketFromChart("Sell", "Market", contextMenu.price)}>Sell market</button>
                <button type="button" onClick={() => setTicketFromChart("Buy", "Limit", contextMenu.price)}>Buy limit</button>
                <button type="button" onClick={() => setTicketFromChart("Sell", "Limit", contextMenu.price)}>Sell limit</button>
                <button type="button" onClick={() => setTicketFromChart("Buy", "Stop", contextMenu.price)}>Buy stop</button>
                <button type="button" onClick={() => setTicketFromChart("Sell", "Stop", contextMenu.price)}>Sell stop</button>
              </div>
            )}
          </div>
        </main>
      </div>

      <footer className="tv-terminal">
        <div className="tv-terminal-tabs">
          {TERMINAL_TABS.map((tab) => (
            <button key={tab} type="button" className={terminalTab === tab ? "active" : ""} onClick={() => setTerminalTab(tab)}>
              {tab}
            </button>
          ))}
          <span className="tv-terminal-account">{selectedAccount?.name || "No account selected"}</span>
        </div>
        <div className="tv-terminal-table-wrap">
          <table className="tv-terminal-table">
            <tbody>{renderTerminalRows()}</tbody>
          </table>
        </div>
      </footer>
    </section>
  );
}
