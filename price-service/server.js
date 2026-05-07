import express from 'express';
import { WebSocketServer } from 'ws';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import http from 'http';
import cors from 'cors';

dotenv.config();

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = process.env.REDIS_PORT || 6380;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const PORT = process.env.PORT || 4000;
const TICK_CHANNELS = (process.env.REDIS_TICK_CHANNELS || 'hx:ticks')
  .split(',')
  .map(channel => channel.trim())
  .filter(Boolean);
const LEGACY_PRICE_PATTERN = process.env.REDIS_PRICE_PATTERN || 'price:*';
const PRICE_PATTERNS = (process.env.REDIS_PRICE_PATTERNS || `TRADOVATE_*_PRICE,${LEGACY_PRICE_PATTERN}`)
  .split(',')
  .map(pattern => pattern.trim())
  .filter(Boolean);

// Setup Redis client for subscription
const redisSubscriber = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  tls: {
    servername: REDIS_HOST
  },
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

// Cache for the latest price per instrument to quickly serve newly connected clients
const latestPrices = new Map();

redisSubscriber.on('connect', () => {
  console.log('✅ Connected to Azure Redis via TLS');
  redisSubscriber.subscribe(...TICK_CHANNELS, (err, count) => {
    if (err) {
      console.error('Failed to subscribe to Redis tick channels:', err);
    } else {
      console.log(`Subscribed to ${count} channel(s): ${TICK_CHANNELS.join(', ')}`);
    }
  });
  redisSubscriber.psubscribe(...PRICE_PATTERNS, (err, count) => {
    if (err) {
      console.error('Failed to subscribe to Redis price pattern:', err);
    } else {
      console.log(`Subscribed to ${count} pattern(s): ${PRICE_PATTERNS.join(', ')}`);
    }
  });
});

redisSubscriber.on('error', (err) => {
  console.error('❌ Redis Connection Error:', err.message);
});

function parsePricePayload(message) {
  let parsedData;
  try {
    parsedData = JSON.parse(message);
    if (typeof parsedData === 'number') {
      parsedData = { price: parsedData, close: parsedData, time: Date.now() / 1000 };
    }
  } catch (e) {
    // If it's a raw number string or arbitrary string
    const num = parseFloat(message);
    if (!isNaN(num)) {
      parsedData = { price: num, close: num, time: Date.now() / 1000 };
    } else {
      parsedData = { raw: message };
    }
  }
  return parsedData;
}

function getSymbolFromChannel(channel) {
  if (!channel) return null;
  const upper = channel.toUpperCase();
  if (upper.startsWith('TRADOVATE_') && upper.endsWith('_PRICE')) {
    return channel.slice('TRADOVATE_'.length, -'_PRICE'.length);
  }
  if (channel.includes(':')) return channel.split(':').pop();
  return null;
}

function normalizePriceData(data, symbol, channel) {
  const price = data.price ?? data.last ?? data.last_price ?? data.lp ?? data.LAST;
  const bid = data.bid ?? data.BID;
  const ask = data.ask ?? data.ASK ?? data.offer ?? data.OFFER;
  const volume = data.volume ?? data.VOLUME ?? data.totalVolume ?? data.TOTAL_VOLUME;
  const timestamp = data.timestamp ?? data.ts ?? data.time ?? data.TIMESTAMP ?? data.UK_TIMESTAMP ?? data.date;
  return {
    ...data,
    symbol: data.symbol || data.contract_month || data.n || data.INSTRUMENT || symbol,
    price,
    last: price,
    bid,
    ask,
    volume,
    timestamp,
    channel,
  };
}

function publishPrice(symbol, parsedData) {
  if (!symbol) return;

  // Update our local cache
  latestPrices.set(symbol, parsedData);

  // Broadcast to all connected WebSocket clients
  const payload = JSON.stringify({
    type: 'price_update',
    symbol,
    data: parsedData
  });

  wss.clients.forEach(client => {
    if (client.readyState === 1 /* WebSocket.OPEN */) {
      client.send(payload);
    }
  });
}

// Handle hx:ticks channel published by backend market data services
redisSubscriber.on('message', (channel, message) => {
  const parsedData = parsePricePayload(message);
  const symbol = parsedData.symbol || parsedData.contract_month || parsedData.n || parsedData.INSTRUMENT || getSymbolFromChannel(channel);
  publishPrice(symbol, normalizePriceData(parsedData, symbol, channel));
});

// Redis Pub/Sub price channels such as TRADOVATE_ESM6_PRICE and older price:MNQ
redisSubscriber.on('pmessage', (pattern, channel, message) => {
  const parsedData = parsePricePayload(message);
  const symbol = parsedData.symbol || parsedData.contract_month || parsedData.n || parsedData.INSTRUMENT || getSymbolFromChannel(channel);
  publishPrice(symbol, normalizePriceData(parsedData, symbol, channel));
});

// WebSocket Server Event Handlers
wss.on('connection', (ws) => {
  console.log('🔌 New frontend client connected');

  // Immediately send the latest cached prices so the client doesn't have to wait for the next tick
  latestPrices.forEach((data, symbol) => {
    ws.send(JSON.stringify({
      type: 'price_update',
      symbol,
      data
    }));
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (err) {
      console.warn('Received invalid message from client:', message.toString());
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Healthcheck endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', activeClients: wss.clients.size });
});

server.listen(PORT, () => {
  console.log(`🚀 Price stream service running on port ${PORT}`);
});
