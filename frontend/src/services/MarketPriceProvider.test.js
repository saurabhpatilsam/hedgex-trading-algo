import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const providerSource = readFileSync(new URL("./MarketPriceProvider.jsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(
  new URL("../components/tradingview/TradingViewWorkspace.jsx", import.meta.url),
  "utf8"
);

test("live price UI uses the production SSE stream endpoint instead of the missing websocket route", () => {
  assert.match(providerSource, /new EventSource\(marketApi\.streamUrl\(\)\)/);
  assert.match(workspaceSource, /new EventSource\(marketApi\.streamUrl\(\)\)/);
  assert.doesNotMatch(providerSource, /new WebSocket\(marketApi\.wsUrl\(\)\)/);
  assert.doesNotMatch(workspaceSource, /new WebSocket\(marketApi\.wsUrl\(\)\)/);
});
