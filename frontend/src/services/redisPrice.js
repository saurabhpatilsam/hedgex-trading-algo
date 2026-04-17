import { create } from 'zustand';
import { redis } from 'ioredis';

const REDIS_HOST = 'orca-redis-manager.redis.cache.windows.net';
const REDIS_PORT = 6380;
const REDIS_PASSWORD = import.meta.env.VITE_REDIS_PASSWORD || '';
const PRICE_KEYS = ['hx:prices', 'prices', 'market:prices', 'ticker:prices'];
const TICK_CHANNEL = 'hx:ticks';
const PRICE_CHANNEL = 'hx:market:ticker';

class RedisPriceService {
    constructor() {
        this.client = null;
        this.subscriber = null;
        this.prices = {};
        this.listeners = new Map();
    }

    async connect() {
        try {
            this.client = new redis({
                host: REDIS_HOST,
                port: REDIS_PORT,
                password: REDIS_PASSWORD,
                tls: { rejectUnauthorized: false },
                connectTimeout: 10000,
                retryStrategy: (times) => times > 10 ? null : Math.min(times * 500, 5000)
            });

            this.subscriber = new redis({
                host: REDIS_HOST,
                port: REDIS_PORT,
                password: REDIS_PASSWORD,
                tls: { rejectUnauthorized: false },
                connectTimeout: 10000,
                retryStrategy: (times) => times > 10 ? null : Math.min(times * 500, 5000)
            });

            this.client.on('connect', () => {
                console.log('[RedisPrice] Connected to Redis');
                this.loadInitialPrices();
            });

            this.subscriber.on('message', (channel, message) => {
                this.handlePriceUpdate(channel, message);
            });

            this.subscriber.on('connect', () => {
                console.log('[RedisPrice] Subscriber connected, subscribing to channels');
                this.subscribeToChannels();
            });

        } catch (error) {
            console.error('[RedisPrice] Failed to connect:', error);
        }
    }

    async loadInitialPrices() {
        try {
            for (const key of PRICE_KEYS) {
                const data = await this.client.hgetall(key);
                if (data && Object.keys(data).length > 0) {
                    console.log('[RedisPrice] Loaded prices from key:', key);
                    this.prices = { ...this.prices, ...data };
                    this.notifyListeners();
                    return;
                }
            }
            console.log('[RedisPrice] No initial prices found');
        } catch (error) {
            console.error('[RedisPrice] Error loading prices:', error);
        }
    }

    async subscribeToChannels() {
        try {
            await this.subscriber.subscribe(TICK_CHANNEL);
            await this.subscriber.subscribe(PRICE_CHANNEL + ':*');
            console.log('[RedisPrice] Subscribed to price channels');
        } catch (error) {
            console.error('[RedisPrice] Subscribe error:', error);
        }
    }

    handlePriceUpdate(channel, message) {
        try {
            const data = JSON.parse(message);
            const symbol = data.symbol || data.contract_month || 'UNKNOWN';
            this.prices[symbol] = data;
            this.notifyListeners(symbol, data);
        } catch (error) {
            console.error('[RedisPrice] Parse error:', error);
        }
    }

    subscribe(callback) {
        const id = Date.now();
        this.listeners.set(id, callback);
        return () => this.listeners.delete(id);
    }

    notifyListeners(symbol, data) {
        this.listeners.forEach((cb) => cb(this.getAllPrices(), symbol, data));
    }

    getAllPrices() {
        const result = {};
        for (const [symbol, priceData] of Object.entries(this.prices)) {
            try {
                result[symbol] = typeof priceData === 'string' ? JSON.parse(priceData) : priceData;
            } catch {
                result[symbol] = priceData;
            }
        }
        return result;
    }

    getPrice(symbol) {
        const priceData = this.prices[symbol];
        if (!priceData) return null;
        try {
            return typeof priceData === 'string' ? JSON.parse(priceData) : priceData;
        } catch {
            return priceData;
        }
    }

    async disconnect() {
        if (this.client) await this.client.quit();
        if (this.subscriber) await this.subscriber.quit();
    }
}

export const redisPriceService = new RedisPriceService();

export const usePriceStore = create((set, get) => ({
    prices: {},
    lastUpdate: null,

    initialize: async () => {
        await redisPriceService.connect();
        redisPriceService.subscribe((prices) => {
            set({ prices, lastUpdate: Date.now() });
        });
    },

    getPrice: (symbol) => {
        const priceData = get().prices[symbol];
        if (!priceData) return null;
        return typeof priceData === 'string' ? JSON.parse(priceData) : priceData;
    },

    getAllPrices: () => get().prices
}));