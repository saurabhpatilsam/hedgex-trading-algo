import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateTickIntoCandle,
  buildPanelOrderPayload,
  calculateBracketPriceFromPoints,
  getGroupAccountIds,
  timeframeToSeconds,
  toggleAccountSelection,
  toCandleSeries,
} from "./tradingViewModel.js";

test("buildPanelOrderPayload maps a limit bracket order to the existing panel API contract", () => {
  const payload = buildPanelOrderPayload({
    targetMode: "accounts",
    selectedAccountIds: [12, 15],
    selectedGroupId: null,
    instrument: { symbol: "NQ", contract_month: "NQM6" },
    side: "Buy",
    quantity: 2,
    orderType: "Limit",
    limitPrice: "28184.13",
    stopPrice: "",
    stopLossEnabled: true,
    stopLossPrice: "28176.48",
    takeProfitEnabled: true,
    takeProfitPrice: "28202.51",
    durationType: "GTC",
  });

  assert.deepEqual(payload, {
    account_ids: [12, 15],
    instrument_symbol: "NQ",
    action: "Buy",
    quantity: 2,
    order_type: "Limit",
    duration_type: "GTC",
    price: 28184.25,
    stop_loss: 28176.5,
    take_profit: 28202.5,
  });
});

test("buildPanelOrderPayload uses group targeting and stop-limit fields", () => {
  const payload = buildPanelOrderPayload({
    targetMode: "group",
    selectedGroupId: 7,
    selectedAccountIds: [],
    instrument: { symbol: "MES", contract_month: "MESM6" },
    side: "Sell",
    quantity: 1,
    orderType: "Stop Limit",
    limitPrice: "7296.62",
    stopPrice: "7297.11",
    stopLossEnabled: false,
    stopLossPrice: "",
    takeProfitEnabled: false,
    takeProfitPrice: "",
    durationType: "Day",
  });

  assert.deepEqual(payload, {
    group_id: 7,
    instrument_symbol: "MES",
    action: "Sell",
    quantity: 1,
    order_type: "StopLimit",
    duration_type: "Day",
    price: 7296.5,
    stop_price: 7297,
  });
});

test("toCandleSeries converts backend candles to lightweight-charts format", () => {
  const candles = toCandleSeries([
    {
      timestamp: "2026-05-06T20:49:00Z",
      open: "7386.75",
      high: "7388",
      low: "7385.5",
      close: "7387.25",
      volume: "126",
    },
    {
      timestamp: "2026-05-06T20:48:00Z",
      open: "7385",
      high: "7387.5",
      low: "7384.75",
      close: "7386.75",
      volume: "98",
    },
  ]);

  assert.deepEqual(candles.map((c) => c.time), [1778100480, 1778100540]);
  assert.equal(candles[0].close, 7386.75);
  assert.equal(candles[1].volume, 126);
});

test("aggregateTickIntoCandle snaps live prices and updates OHLC in the same bucket", () => {
  const timeframeSeconds = timeframeToSeconds("1m");
  const first = aggregateTickIntoCandle(null, {
    symbol: "NQM6",
    price: 28184.13,
    volume: 3,
    timestamp: "2026-05-06T20:48:36Z",
  }, { symbol: "NQM6", timeframeSeconds });

  const second = aggregateTickIntoCandle(first, {
    symbol: "NQM6",
    price: 28185.62,
    volume: 7,
    timestamp: "2026-05-06T20:48:49Z",
  }, { symbol: "NQM6", timeframeSeconds });

  assert.deepEqual(second, {
    time: 1778100480,
    open: 28184.25,
    high: 28185.5,
    low: 28184.25,
    close: 28185.5,
    volume: 10,
  });
});

test("toggleAccountSelection keeps a stable multi-account selection", () => {
  assert.deepEqual(toggleAccountSelection([5, 2], 4), [5, 2, 4]);
  assert.deepEqual(toggleAccountSelection([5, 2, 4], 2), [5, 4]);
  assert.deepEqual(toggleAccountSelection([5, 4], ""), [5, 4]);
});

test("getGroupAccountIds returns the accounts attached to a selected group", () => {
  const groups = [
    { id: 3, name: "Other", members: [{ account_id: 90 }] },
    {
      id: 7,
      name: "Core",
      members: [{ account_id: 12 }, { account_id: 15 }, { account_id: null }],
    },
  ];

  assert.deepEqual(getGroupAccountIds(groups, "7"), [12, 15]);
  assert.deepEqual(getGroupAccountIds(groups, "missing"), []);
});

test("calculateBracketPriceFromPoints offsets from entry price by side and snaps to tick", () => {
  assert.equal(calculateBracketPriceFromPoints({
    entryPrice: 100,
    points: 20.12,
    side: "Buy",
    bracket: "takeProfit",
    symbol: "NQM6",
  }), 120);

  assert.equal(calculateBracketPriceFromPoints({
    entryPrice: 100,
    points: 10.12,
    side: "Buy",
    bracket: "stopLoss",
    symbol: "NQM6",
  }), 90);

  assert.equal(calculateBracketPriceFromPoints({
    entryPrice: 100,
    points: 20,
    side: "Sell",
    bracket: "takeProfit",
    symbol: "NQM6",
  }), 80);

  assert.equal(calculateBracketPriceFromPoints({
    entryPrice: 100,
    points: 10,
    side: "Sell",
    bracket: "stopLoss",
    symbol: "NQM6",
  }), 110);
});
