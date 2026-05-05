import assert from "node:assert/strict";
import test from "node:test";

import {
    formatMarketPrice,
    getDisplayPrice,
    getQuoteNumber,
    getTickSize,
    normalizeToTick,
} from "./marketPrice.js";

test("getDisplayPrice uses the live last price instead of an invalid bid/ask midpoint", () => {
    assert.equal(getDisplayPrice({ price: 28185, bid: 28184, ask: 28184.5 }, "NQM6"), 28185);
});

test("getDisplayPrice falls back to last trade when bid/ask are incomplete", () => {
    assert.equal(getDisplayPrice({ price: 7296, bid: 7295.75 }, "ESM6"), 7296);
});

test("getQuoteNumber rejects empty and zero placeholder values", () => {
    assert.equal(getQuoteNumber(""), null);
    assert.equal(getQuoteNumber(0), null);
    assert.equal(getQuoteNumber("4567.25"), 4567.25);
});

test("getTickSize follows configured futures tick sizes by instrument root", () => {
    assert.equal(getTickSize("NQM6"), 0.25);
    assert.equal(getTickSize("MNQM6"), 0.25);
    assert.equal(getTickSize("ESM6"), 0.25);
    assert.equal(getTickSize("MESM6"), 0.25);
    assert.equal(getTickSize("GCM6"), 0.1);
    assert.equal(getTickSize("MGCM6"), 0.1);
});

test("normalizeToTick snaps index futures to valid quarter-point prices", () => {
    assert.equal(normalizeToTick(28184.13, "NQM6"), 28184.25);
    assert.equal(normalizeToTick(7295.62, "MESM6"), 7295.5);
});

test("formatMarketPrice keeps fixed decimals after tick normalization", () => {
    assert.equal(formatMarketPrice(7296, "ESM6"), "7,296.00");
    assert.equal(formatMarketPrice(28184.13, "NQM6"), "28,184.25");
    assert.equal(formatMarketPrice(4567.28, "GCM6"), "4,567.30");
    assert.equal(formatMarketPrice(null, "NQM6"), "—");
});
