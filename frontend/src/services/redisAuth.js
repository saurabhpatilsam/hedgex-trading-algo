import { create } from 'zustand';
import { redis } from 'ioredis';

const REDIS_HOST = 'orca-redis-manager.redis.cache.windows.net';
const REDIS_PORT = 6380;
const REDIS_PASSWORD = import.meta.env.VITE_REDIS_PASSWORD || '';
const TOKEN_KEYS = ['bearer_token', 'auth_token', 'token', 'access_token', 'Authorization', 'jwt', 'auth'];
const TOKEN_REFRESH_INTERVAL = 60000;

class RedisAuthService {
    constructor() {
        this.client = null;
        this.token = null;
        this.listeners = [];
        this.intervalId = null;
    }

    async connect() {
        try {
            this.client = new redis({
                host: REDIS_HOST,
                port: REDIS_PORT,
                password: REDIS_PASSWORD,
                tls: {
                    rejectUnauthorized: false
                },
                connectTimeout: 10000,
                retryStrategy: (times) => {
                    if (times > 10) return null;
                    return Math.min(times * 500, 5000);
                }
            });

            this.client.on('connect', () => {
                console.log('[RedisAuth] Connected to Redis');
                this.fetchToken();
            });

            this.client.on('error', (err) => {
                console.error('[RedisAuth] Redis error:', err.message);
            });

            this.client.on('ready', () => {
                console.log('[RedisAuth] Redis ready');
            });

        } catch (error) {
            console.error('[RedisAuth] Failed to connect:', error);
        }
    }

    async fetchToken() {
        try {
            const keys = await this.client.keys('*');
            console.log('[RedisAuth] Available keys:', keys);

            for (const key of keys) {
                const value = await this.client.get(key);
                if (value && this.looksLikeToken(value)) {
                    console.log('[RedisAuth] Found token in key:', key);
                    this.token = value;
                    this.notifyListeners();
                    this.startTokenRefresh();
                    return;
                }
                const type = await this.client.type(key);
                if (type === 'hash') {
                    const hashData = await this.client.hgetall(key);
                    for (const [field, val] of Object.entries(hashData)) {
                        if (this.looksLikeToken(val)) {
                            console.log('[RedisAuth] Found token in hash field:', key, field);
                            this.token = val;
                            this.notifyListeners();
                            this.startTokenRefresh();
                            return;
                        }
                    }
                }
            }

            for (const key of TOKEN_KEYS) {
                const value = await this.client.get(key);
                if (value && this.looksLikeToken(value)) {
                    console.log('[RedisAuth] Found token at key:', key);
                    this.token = value;
                    this.notifyListeners();
                    this.startTokenRefresh();
                    return;
                }
            }

            console.warn('[RedisAuth] No bearer token found in Redis');

        } catch (error) {
            console.error('[RedisAuth] Error fetching token:', error);
        }
    }

    looksLikeToken(value) {
        if (!value || typeof value !== 'string') return false;
        return (
            value.length > 20 &&
            (value.includes('.') || value.startsWith('eyJ') || !value.includes(' '))
        );
    }

    startTokenRefresh() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        this.intervalId = setInterval(() => {
            this.fetchToken();
        }, TOKEN_REFRESH_INTERVAL);
    }

    getToken() {
        return this.token;
    }

    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    notifyListeners() {
        this.listeners.forEach(cb => cb(this.token));
    }

    disconnect() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        if (this.client) {
            this.client.quit();
        }
    }
}

export const redisAuthService = new RedisAuthService();

export const useAuthStore = create((set, get) => ({
    token: null,
    isAuthenticated: false,

    initialize: async () => {
        await redisAuthService.connect();
        redisAuthService.subscribe((token) => {
            set({ token, isAuthenticated: !!token });
        });
    },

    getToken: () => get().token,

    logout: () => {
        set({ token: null, isAuthenticated: false });
    }
}));