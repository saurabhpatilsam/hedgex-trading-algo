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
  // Subscribe to a generic price pattern. We assume channels like 'price:MNQ', 'price:ES'
  redisSubscriber.psubscribe('price:*', (err, count) => {
    if (err) {
      console.error('Failed to subscribe:', err);
    } else {
      console.log(`Subscribed to ${count} pattern(s). Waiting for prices...`);
    }
  });
});

redisSubscriber.on('error', (err) => {
  console.error('❌ Redis Connection Error:', err.message);
});

// Handle incoming published messages
redisSubscriber.on('pmessage', (pattern, channel, message) => {
  // Extract symbol from channel, e.g., 'price:MNQ' -> 'MNQ'
  const symbol = channel.split(':').pop();
  
  let parsedData;
  try {
    parsedData = JSON.parse(message);
    // If it's a simple number inside quotes or similar, handle it
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
