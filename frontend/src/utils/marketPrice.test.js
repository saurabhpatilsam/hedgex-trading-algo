import assert from "node:assert/strict";
import test from "node:test";

import { formatMarketPrice, getDisplayPrice, getQuoteNumber } from "./marketPrice.js";

test("getDisplayPrice prefers the live bid/ask midpoint over last trade", () => {
    assert.equal(getDisplayPrice({ price: 28185, bid: 28184, ask: 28184.5 }), 28184.25);
});

test("getDisplayPrice falls back to last trade when bid/ask are incomplete", () => {
    assert.equal(getDisplayPrice({ price: 7296, bid: 7295.75 }), 7296);
});

test("getQuoteNumber rejects empty and zero placeholder values", () => {
    assert.equal(getQuoteNumber(""), null);
    assert.equal(getQuoteNumber(0), null);
    assert.equal(getQuoteNumber("4567.25"), 4567.25);
});

test("formatMarketPrice keeps fixed decimals without throwing on missing values", () => {
    assert.equal(formatMarketPrice(7296), "7,296.00");
    assert.equal(formatMarketPrice(null), "—");
});
