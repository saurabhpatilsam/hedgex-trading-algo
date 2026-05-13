/**
 * MarketPriceProvider — Singleton live-price context.
 *
 * Follows the Orca "MarketPriceProvider / useMarketPrices()" pattern
 * documented in live-write-stream.md.
 *
 * Usage:
 *   1. Wrap your app:  <MarketPriceProvider> <App /> </MarketPriceProvider>
 *   2. In any component: const { livePrices, sseConnected, mdStatus } = useMarketPrices();
 *
 * Rules:
 *   - Do NOT create another raw browser price connection elsewhere.
 *   - This provider owns the one shared connection to /api/market/stream.
 *   - Handles browser reconnects, stale-detection, and REST fallback polling.
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { marketApi } from "../api";
import { getPriceSnapshotSignature, getDisplayPrice } from "../utils/marketPrice";
import { normalizeMarketStreamMessage } from "../components/tradingview/tradingViewModel";

// ── Constants ──────────────────────────────────────────────
const STREAM_STALE_MS = 2500;
const REDIS_FALLBACK_POLL_MS = 1000;
const MD_STATUS_POLL_MS = 30000;
const FALLBACK_INSTRUMENTS = ["ESM6", "GCM6", "MESM6", "MGCM6", "MNQM6", "NQM6"];

// ── Context ────────────────────────────────────────────────
const MarketPriceContext = createContext({
    livePrices: {},
    sseConnected: false,
    mdStatus: null,
});

/**
 * Hook to consume live prices from the shared provider.
 * Returns { livePrices, sseConnected, mdStatus }.
 */
export function useMarketPrices() {
    return useContext(MarketPriceContext);
}

/**
 * Provider component — opens one Redis-backed SSE stream, keeps
 * an in-memory price cache, and falls back to REST polling when
 * the stream is stale or disconnected.
 */
export function MarketPriceProvider({ children }) {
    const [livePrices, setLivePrices] = useState({});
    const [sseConnected, setSseConnected] = useState(false);
    const [mdStatus, setMdStatus] = useState(null);

    const streamRef = useRef(null);
    const lastPriceUpdateRef = useRef(0);
    const priceSnapshotSignatureRef = useRef("");

    // ── Helpers ─────────────────────────────────────────────
    const markPriceUpdate = useCallback(() => {
        lastPriceUpdateRef.current = Date.now();
    }, []);

    const applyPriceSnapshot = useCallback(
        (nextPrices) => {
            const signature = getPriceSnapshotSignature(nextPrices);
            if (!signature) return false;

            setLivePrices(nextPrices);
            if (signature !== priceSnapshotSignatureRef.current) {
                priceSnapshotSignatureRef.current = signature;
                markPriceUpdate();
                return true;
            }
            return false;
        },
        [markPriceUpdate]
    );

    const applyTick = useCallback(
        (tick) => {
            if (!tick?.symbol) return;
            setLivePrices((prev) => {
                const next = {
                    ...prev,
                    [tick.symbol]: { ...(prev[tick.symbol] || {}), ...tick },
                };
                priceSnapshotSignatureRef.current = getPriceSnapshotSignature(next);
                return next;
            });
            markPriceUpdate();
        },
        [markPriceUpdate]
    );

    // ── Redis SSE Connection ────────────────────────────────
    const connectStream = useCallback(() => {
        // Prevent double-connect
        if (streamRef.current && streamRef.current.readyState !== EventSource.CLOSED) return;

        const stream = new EventSource(marketApi.streamUrl());
        streamRef.current = stream;

        stream.onopen = () => {
            setSseConnected(true);
        };

        const handleFrame = (event) => {
            try {
                const message = normalizeMarketStreamMessage(JSON.parse(event.data));
                if (!message) return;

                if (message.type === "snapshot") {
                    applyPriceSnapshot(message.prices);
                    return;
                }

                if (message.type === "tick") {
                    applyTick(message.tick);
                    return;
                }

                if (message.type === "error") {
                    setSseConnected(false);
                }
            } catch {
                /* malformed frame — ignore */
            }
        };

        stream.addEventListener("snapshot", handleFrame);
        stream.addEventListener("tick", handleFrame);
        stream.addEventListener("message", handleFrame);
        stream.addEventListener("error", (event) => {
            if ("data" in event && event.data) handleFrame(event);
            setSseConnected(false);
        });
    }, [applyPriceSnapshot, applyTick]);

    // ── Lifecycle: open Redis SSE + poll MD status ───────────
    useEffect(() => {
        // Initial MD status check
        marketApi.status().then(setMdStatus).catch(() => {});

        // Open Redis-backed stream
        connectStream();

        // Poll MD status periodically
        const statusInterval = setInterval(() => {
            marketApi.status().then(setMdStatus).catch(() => {});
        }, MD_STATUS_POLL_MS);

        return () => {
            clearInterval(statusInterval);
            if (streamRef.current) {
                streamRef.current.close();
                streamRef.current = null;
            }
        };
    }, [connectStream]);

    // ── REST Fallback Polling ────────────────────────────────
    // If the live stream is disconnected or stale, poll the Redis-backed REST API.
    useEffect(() => {
        const fallback = setInterval(async () => {
            const streamIsFresh =
                sseConnected &&
                lastPriceUpdateRef.current &&
                Date.now() - lastPriceUpdateRef.current < STREAM_STALE_MS;
            if (streamIsFresh) return;

            // Try bulk snapshot first
            try {
                const data = await marketApi.prices();
                if (data.prices && Object.keys(data.prices).length > 0) {
                    applyPriceSnapshot(data.prices);
                    return;
                }
            } catch {
                /* continue to per-symbol fallback */
            }

            // Per-symbol fallback
            for (const sym of FALLBACK_INSTRUMENTS) {
                try {
                    const quote = await marketApi.liveQuote(sym);
                    if (getDisplayPrice(quote, sym) != null) {
                        const symbol = quote.symbol || sym;
                        setLivePrices((prev) => ({
                            ...prev,
                            [symbol]: { ...(prev[symbol] || {}), ...quote },
                        }));
                        markPriceUpdate();
                    }
                } catch {
                    /* silent */
                }
            }
        }, REDIS_FALLBACK_POLL_MS);

        return () => clearInterval(fallback);
    }, [applyPriceSnapshot, sseConnected, markPriceUpdate]);

    // ── Provide ─────────────────────────────────────────────
    return (
        <MarketPriceContext.Provider value={{ livePrices, sseConnected, mdStatus }}>
            {children}
        </MarketPriceContext.Provider>
    );
}
