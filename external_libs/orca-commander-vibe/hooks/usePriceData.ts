import { useState, useEffect, useCallback, useMemo } from 'react';


export interface LivePriceData {
  symbol: string;
  currentPrice: number;
  previousPrice: number;
  change: number;
  changePercent: number;
  lastUpdate: string;
  instrument: string;
}

interface PriceData {
  TIMESTAMP?: string;  // New format from Redis
  UK_TIMESTAMP?: string;  // Legacy format
  LAST: number;
  INSTRUMENT: string;
}

export function usePriceData() {
  const [priceData, setPriceData] = useState<Record<string, LivePriceData>>({});
  const [channelMapping, setChannelMapping] = useState<Record<string, string>>({});
  const [websocketActivity, setWebsocketActivity] = useState<Record<string, number>>({});

  // Fetch configuration from API
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const config = await response.json();
          console.log('📋 Config fetched:', config);
          console.log('🗺️ Channel mapping:', config.mapping);
          setChannelMapping(config.mapping);
        } else {
          console.error('❌ Failed to fetch config, status:', response.status);
        }
      } catch (error) {
        console.error('❌ Failed to fetch config:', error);
      }
    };
    
    fetchConfig();
  }, []);

  const updatePriceData = useCallback((channel: string, data: PriceData) => {
      // Add null checks for data properties
      const timestamp = data.TIMESTAMP || data.UK_TIMESTAMP;
      
      if (data.LAST === null || data.LAST === undefined || 
          !timestamp ||
          data.INSTRUMENT === null || data.INSTRUMENT === undefined) {
        console.warn('⚠️ Incomplete price data for channel:', channel, data);
        return;
      }

    setPriceData(prev => {
      // Get the symbol from the current channel mapping
      const symbol = channelMapping[channel];
      if (!symbol) {
        console.warn('⚠️ No symbol mapping found for channel:', channel);
        console.log('Available mappings:', channelMapping);
        return prev;
      }

      const current = prev[symbol];
      const newPrice = data.LAST;
      const previousPrice = current?.currentPrice || newPrice;
      const change = newPrice - previousPrice;
      const changePercent = previousPrice !== 0 ? (change / previousPrice) * 100 : 0;

      console.log('✅ Updating price for symbol:', symbol, '- Price:', newPrice);

      return {
        ...prev,
        [symbol]: {
          symbol,
          currentPrice: newPrice,
          previousPrice: current?.currentPrice || newPrice,
          change,
          changePercent,
          lastUpdate: timestamp,  // Use the timestamp we validated above
          instrument: data.INSTRUMENT,
        }
      };
    });

    // Update websocket activity timestamp
    const symbol = channelMapping[channel];
    if (symbol) {
      setWebsocketActivity(prev => ({
        ...prev,
        [symbol]: Date.now()
      }));
    }
  }, [channelMapping]);

  useEffect(() => {
    // Set up Server-Sent Events connection
    console.log('🔌 Connecting to price stream at /api/prices/stream');
    const eventSource = new EventSource('/api/prices/stream');
    let heartbeatCount = 0;
    
    eventSource.onopen = () => {
      console.log('✅ Price stream connection opened');
    };
    
    eventSource.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);
        
        // Log heartbeat messages separately (only every 10th one to reduce noise)
        if (update.channel === 'heartbeat' || update.data?.type === 'heartbeat') {
          heartbeatCount++;
          if (heartbeatCount % 10 === 0) {
            console.log(`💓 Heartbeat received (${heartbeatCount} total)`);
          }
          return;
        }
        
        // Add validation for update structure
        if (!update.channel) {
          console.warn('⚠️ Received update without channel:', update);
          return;
        }
        
        // Allow null data but skip processing
        if (update.data === null) {
          console.warn('⚠️ Received null data for channel:', update.channel);
          return;
        }
        
        console.log('📊 Price update received:', {
          channel: update.channel,
          price: update.data?.LAST,
          instrument: update.data?.INSTRUMENT,
          timestamp: update.data?.UK_TIMESTAMP
        });
        
        updatePriceData(update.channel, update.data);
      } catch (error) {
        console.error('❌ Error parsing price update:', error, event.data);
      }
    };

    eventSource.onerror = (error) => {
      console.error('❌ Price stream error:', error);
      console.log('🔄 Closing price stream connection');
      eventSource.close();
    };

    return () => {
      console.log('🔌 Disconnecting from price stream');
      eventSource.close();
    };
  }, [updatePriceData]);

  // Don't initialize with dummy data - show skeletons until real data arrives

  // Memoize the prices array to prevent unnecessary re-renders
  const prices = useMemo(() => Object.values(priceData), [priceData]);

  return { prices, websocketActivity };
}
