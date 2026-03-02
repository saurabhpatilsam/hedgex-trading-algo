import { cleanupRedisConnections } from './redis';
import { connectionManager } from './connection-manager';

// Increase max listeners to prevent warnings
process.setMaxListeners(50);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT, cleaning up Redis connections...');
  cleanupRedisConnections().finally(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, cleaning up Redis connections...');
  cleanupRedisConnections().finally(() => {
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  cleanupRedisConnections().finally(() => {
    process.exit(1);
  });
});

// Handle unhandled promise rejections - but don't exit for Redis disconnect errors
process.on('unhandledRejection', (reason, promise) => {
  // Check if it's a Redis disconnect error and ignore it
  const reasonString = String(reason);
  if (reasonString.includes('Disconnects client') || 
      reasonString.includes('ClientClosedError') ||
      reasonString.includes('ERR_INVALID_STATE') ||
      reasonString.includes('Connection timeout') ||
      reasonString.includes('Socket closed') ||
      reasonString.includes('Connection is closed')) {
    // Silently ignore these expected Redis cleanup errors
    return;
  }
  
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  cleanupRedisConnections().finally(() => {
    process.exit(1);
  });
});

// Suppress all Redis-related console errors
const originalConsoleError = console.error;
console.error = (...args) => {
  const message = args.join(' ');
  if (message.includes('Disconnects client') || 
      message.includes('ClientClosedError') ||
      message.includes('ERR_INVALID_STATE') ||
      message.includes('Connection timeout') ||
      message.includes('Socket closed') ||
      message.includes('Connection is closed')) {
    // Suppress Redis-related errors
    return;
  }
  originalConsoleError.apply(console, args);
};

// Periodic connection monitoring and cleanup
setInterval(() => {
  const activeCount = connectionManager.getConnectionCount();
  if (activeCount > 15) {
    console.log(`⚠️ High connection count detected: ${activeCount}. Auto-cleaning...`);
    connectionManager.forceCleanup();
  }
}, 60000); // Check every 60 seconds
