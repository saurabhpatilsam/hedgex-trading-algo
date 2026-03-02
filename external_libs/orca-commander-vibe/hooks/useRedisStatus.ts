import { useState, useEffect } from 'react';

export function useRedisStatus() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [redisHost, setRedisHost] = useState<string>('');

  useEffect(() => {
    const checkRedisStatus = async () => {
      try {
        const response = await fetch('/api/redis-status');
        const data = await response.json();
        const wasConnected = isConnected;
        const newConnected = data.connected;
        setIsConnected(newConnected);
        
        // Set Redis host from server response
        if (data.host) {
          setRedisHost(data.host);
        }
        
        // Only log if connection status changed
        if (wasConnected !== newConnected) {
          console.log(`Redis connection status: ${newConnected ? 'Connected' : 'Disconnected'}`);
        }
      } catch (error) {
        const wasConnected = isConnected;
        setIsConnected(false);
        if (wasConnected) {
          console.log('Redis connection status: Disconnected');
        }
      } finally {
        setIsLoading(false);
      }
    };

    // Initial check
    checkRedisStatus();

    // Set up periodic checks every 30 seconds (reduced from 5 seconds)
    const interval = setInterval(checkRedisStatus, 30000);

    return () => clearInterval(interval);
  }, [isConnected]);

  return { isConnected, isLoading, redisHost };
}
