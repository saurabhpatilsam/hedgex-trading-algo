import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PRIMARY_ACCESS_KEY = process.env.REDIS_PRIMARY_ACCESS_KEY;

export interface PriceData {
  TIMESTAMP?: string;  // New format from Redis
  UK_TIMESTAMP?: string;  // Legacy format
  LAST: number;
  INSTRUMENT: string;
}

// Global Redis client instance to avoid multiple connections
let globalRedisClient: Redis | null = null;
let globalSubscriber: Redis | null = null;

// Track active connections for cleanup
const activeConnections = new Set<Redis>();

// Track message listeners to prevent memory leaks
const messageListeners = new Map<string, Set<(messageChannel: string, message: string) => void>>();

export function getRedisClient() {
  if (!REDIS_HOST || !REDIS_PORT || !REDIS_PRIMARY_ACCESS_KEY) {
    console.error('Missing one or more Redis environment variables. Check your .env.local file.');
    return null;
  }

  try {
    // Use single-node Redis client for the new non-cluster Redis instance
    const client = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PRIMARY_ACCESS_KEY,
      tls: {},
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10000,
    });

    // Track this connection for cleanup
    activeConnections.add(client);

    // Handle connection events
    client.on('error', (err) => {
      // Only log critical errors, suppress common connection noise
      if (err.message.includes('ECONNREFUSED') || err.message.includes('Connection is closed')) {
        return;
      }
    });

    client.on('close', () => {
      activeConnections.delete(client);
    });

    return client;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return null;
  }
}

// Get or create a shared Redis client for status checks
export async function getSharedRedisClient() {
  try {
    if (!globalRedisClient || globalRedisClient.status === 'end') {
      globalRedisClient = getRedisClient();
      if (globalRedisClient) {
        await globalRedisClient.connect();
      }
    }
    return globalRedisClient;
  } catch (error) {
    console.error('Error getting shared Redis client:', error);
    return null;
  }
}

// Get or create a shared subscriber for price streams
export async function getSharedSubscriber() {
  try {
    if (!globalSubscriber || globalSubscriber.status === 'end') {
      const client = await getSharedRedisClient();
      if (client) {
        globalSubscriber = client.duplicate();
        await globalSubscriber.connect();
      }
    }
    return globalSubscriber;
  } catch (error) {
    console.error('Error getting shared subscriber:', error);
    return null;
  }
}

// Cleanup function to close all connections
export async function cleanupRedisConnections() {
  try {
    // Cleanup global clients
    if (globalRedisClient) {
      try {
        await globalRedisClient.quit();
      } catch (disconnectError) {
        // Ignore disconnect errors - client might already be closed
      }
      globalRedisClient = null;
    }

    if (globalSubscriber) {
      try {
        await globalSubscriber.quit();
      } catch (disconnectError) {
        // Ignore disconnect errors - client might already be closed
      }
      globalSubscriber = null;
    }

    // Cleanup all tracked connections
    const connections = Array.from(activeConnections);
    for (const connection of connections) {
      try {
        await connection.quit();
      } catch (disconnectError) {
        // Ignore disconnect errors
      }
    }
    activeConnections.clear();

    // Cleanup message listeners
    messageListeners.clear();

  } catch (error) {
    // Ignore cleanup errors
  }
}

export async function subscribeToPriceChannel(
  channel: string,
  onMessage: (data: PriceData) => void
) {
  try {
    const subscriber = await getSharedSubscriber();
    if (!subscriber) {
      console.error('Failed to get Redis subscriber');
      return null;
    }

    // Subscribe to channel if not already subscribed
    if (!messageListeners.has(channel)) {
      await subscriber.subscribe(channel);
      messageListeners.set(channel, new Set());
      
      // Set up the main message handler for this channel
      subscriber.on('message', (messageChannel: string, message: string) => {
        if (messageChannel === channel) {
          // Notify all listeners for this channel
          const listeners = messageListeners.get(channel);
          if (listeners) {
            listeners.forEach(listener => {
              try {
                listener(messageChannel, message);
              } catch (error) {
                console.error('Error in message listener:', error);
              }
            });
          }
        }
      });
    }

    // Add this specific message handler
    const listeners = messageListeners.get(channel);
    if (listeners) {
      listeners.add((messageChannel: string, message: string) => {
        try {
          const data: PriceData = JSON.parse(message);
          onMessage(data);
        } catch (error) {
          console.error('Error parsing price message:', error);
        }
      });
    }

    return subscriber;
  } catch (error) {
    console.error(`Failed to subscribe to channel ${channel}:`, error);
    return null;
  }
}
