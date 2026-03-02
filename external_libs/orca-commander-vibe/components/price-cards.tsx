
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePriceData, LivePriceData } from '@/hooks/usePriceData';
import { useRedisStatus } from '@/hooks/useRedisStatus';
import { useState, useEffect, useRef, useMemo } from 'react';
import { getInstruments } from '@/lib/config';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, XCircle } from 'lucide-react';

// Get stale threshold from environment variable, default to 60 seconds
const STALE_THRESHOLD = parseInt(process.env.NEXT_PUBLIC_STALE_THRESHOLD_SECONDS || '60') * 1000;

interface PriceCardsProps {
  prices?: LivePriceData[];
}

interface HotspotProps {
  status: 'active' | 'stale' | 'inactive';
  message: string;
  websocketActive: boolean;
}

function Hotspot({ status, message, websocketActive }: HotspotProps) {
  const getStatusStyles = () => {
    switch (status) {
      case 'active':
        return {
          bg: 'bg-green-500',
          glow: 'shadow-[0_0_12px_rgba(34,197,94,0.8)]'
        };
      case 'stale':
        return {
          bg: 'bg-yellow-500',
          glow: 'shadow-[0_0_12px_rgba(234,179,8,0.8)]'
        };
      case 'inactive':
        return {
          bg: 'bg-gray-400',
          glow: 'shadow-[0_0_8px_rgba(156,163,175,0.4)]'
        };
      default:
        return {
          bg: 'bg-gray-400',
          glow: 'shadow-[0_0_8px_rgba(156,163,175,0.4)]'
        };
    }
  };

  const styles = getStatusStyles();

  return (
    <div className={`w-3 h-3 rounded-full ${styles.bg} ${styles.glow}`} />
  );
}

// Function to check if CME equity market is open (converted from Python logic)
function isCMEEquityMarketOpen(): boolean {
  const now = new Date();
  
  // Convert to Eastern Time
  const etTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  const currentTime = etTime.getTime();
  const weekday = etTime.getDay(); // 0: Sun, 1: Mon, ..., 6: Sat
  
  // Get current time in hours and minutes
  const hours = etTime.getHours();
  const minutes = etTime.getMinutes();
  const currentTimeMinutes = hours * 60 + minutes;
  
  // Saturday (6) - market closed
  if (weekday === 6) {
    return false;
  }
  
  // Sunday (0) - open from 18:00 ET onwards
  if (weekday === 0) {
    return currentTimeMinutes >= 18 * 60; // 18:00 ET
  }
  
  // Friday (5) - closed after 17:00 ET
  if (weekday === 5) {
    return currentTimeMinutes < 17 * 60; // Before 17:00 ET
  }
  
  // Monday to Thursday (1-4) - open except during 17:00-18:00 ET break
  if (currentTimeMinutes >= 17 * 60 && currentTimeMinutes < 18 * 60) {
    return false; // Daily maintenance break
  }
  
  return true;
}

export function PriceCards({ prices: propPrices }: PriceCardsProps) {
  const { prices: livePrices, websocketActivity } = usePriceData();
  const { isConnected, isLoading } = useRedisStatus();
  
  // Memoize the prices to prevent unnecessary re-renders
  const prices = useMemo(() => {
    const finalPrices = propPrices || livePrices;
    console.log('💳 PriceCards - Final prices:', finalPrices);
    return finalPrices;
  }, [propPrices, livePrices]);
  
  // Track previous prices to detect changes
  const [previousPrices, setPreviousPrices] = useState<Record<string, number>>({});
  const [lastChangeTimes, setLastChangeTimes] = useState<Record<string, number>>({});
  
  // Get instruments from environment configuration
  const [instruments, setInstruments] = useState<Array<{ symbol: string; instrument: string }>>([]);
  
  // Market hours state
  const [isMarketOpen, setIsMarketOpen] = useState<boolean>(false);
  
  // Fetch instruments from config
  useEffect(() => {
    const fetchInstruments = async () => {
      try {
        console.log('🎯 Fetching instruments from /api/config');
        const response = await fetch('/api/config');
        if (response.ok) {
          const config = await response.json();
          console.log('✅ Instruments fetched:', config.instruments);
          setInstruments(config.instruments || []);
        } else {
          console.error('❌ Failed to fetch instruments, status:', response.status);
        }
      } catch (error) {
        console.error('❌ Failed to fetch instruments:', error);
      }
    };
    
    fetchInstruments();
  }, []);
  
  // Update market hours status every minute
  useEffect(() => {
    const updateMarketStatus = () => {
      setIsMarketOpen(isCMEEquityMarketOpen());
    };
    
    // Initial check
    updateMarketStatus();
    
    // Update every minute
    const interval = setInterval(updateMarketStatus, 60000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Use instruments from config, fallback to empty array if not available
  const displayInstruments = instruments.length > 0 ? instruments : [];
  
  // Log display state
  useEffect(() => {
    console.log('📊 PriceCards render state:', {
      displayInstruments: displayInstruments.length,
      prices: prices.length,
      isConnected,
      isLoading
    });
  }, [displayInstruments, prices, isConnected, isLoading]);
  
  // Track price changes
  useEffect(() => {
    const now = Date.now();
    const newPreviousPrices = { ...previousPrices };
    const newLastChangeTimes = { ...lastChangeTimes };
    
    prices.forEach(price => {
      if (price && price.currentPrice !== undefined) {
        const previousPrice = previousPrices[price.symbol];
        if (previousPrice !== undefined && previousPrice !== price.currentPrice) {
          newLastChangeTimes[price.symbol] = now;
        }
        newPreviousPrices[price.symbol] = price.currentPrice;
      }
    });
    
    setPreviousPrices(newPreviousPrices);
    setLastChangeTimes(newLastChangeTimes);
  }, [prices]);

  const formatPrice = (price: number) => {
    return price.toFixed(2);
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      // Handle the new UK timestamp format: "2025-08-31 20:47:18.933246"
      const date = new Date(timestamp.replace(' ', 'T'));
      
      // Format as DD/MM/YYYY, HH:MM:SS.S
      const dateFormatted = date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      
      const timeFormatted = date.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      // Extract milliseconds and format to 1 decimal place
      const milliseconds = date.getMilliseconds();
      const millisecondsFormatted = (milliseconds / 1000).toFixed(1).substring(1); // Remove leading "0"
      
      return `${dateFormatted}, ${timeFormatted}${millisecondsFormatted}`;
    } catch (error) {
      // Fallback to original timestamp if parsing fails
      return timestamp;
    }
  };

  return (
    <div className="space-y-3">
      {/* Market Hours Indicator */}
      <div className="flex items-center gap-2">
        <Badge 
          variant={isMarketOpen ? "default" : "secondary"}
          className={`flex items-center gap-1 ${
            isMarketOpen 
              ? "bg-green-100 text-green-800 border-green-200" 
              : "bg-gray-100 text-gray-800 border-gray-200"
          }`}
        >
          {isMarketOpen ? (
            <CheckCircle className="h-3 w-3" />
          ) : (
            <XCircle className="h-3 w-3" />
          )}
          {isMarketOpen ? "Market Open Hours" : "Market Closed Hours"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          CME Equity Futures
        </span>
      </div>

      {/* Price Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 sm:gap-3 mb-4">
        {displayInstruments.length === 0 && (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            Loading instruments...
          </div>
        )}
        {displayInstruments.map(({ symbol, instrument }) => {
          const price = prices?.find(p => p?.symbol === symbol);
          
          // Show skeleton if no price data available or Redis is not connected
          if (!price || !isConnected || !price.currentPrice) {
            return (
              <Card key={symbol} className="shadow-sm">
                <CardHeader className="pb-1 pt-2 sm:pt-3 px-2 sm:px-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-xs font-semibold truncate">{instrument}</CardTitle>
                    <Hotspot 
                      status="inactive" 
                      message="No price data available" 
                      websocketActive={false}
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-2 sm:pb-3 px-2 sm:px-3">
                  <div className="space-y-1">
                    <Skeleton className="h-4 sm:h-5 w-12 sm:w-16" />
                    <Skeleton className="h-2 sm:h-3 w-16 sm:w-20" />
                  </div>
                </CardContent>
              </Card>
            );
          }
          
          // Calculate status for this symbol
          const now = Date.now();
          const lastChangeTime = lastChangeTimes[symbol];
          const lastWebsocketActivity = websocketActivity[symbol];
          
          // Check if websocket is active (received data in last 1 second)
          const isWebsocketActive = lastWebsocketActivity && (now - lastWebsocketActivity) < 1000;
          
          // Check if price is stale (hasn't changed in threshold time)
          const isStale = lastChangeTime && (now - lastChangeTime) > STALE_THRESHOLD;
          
          // Determine hotspot status
          let hotspotStatus: 'active' | 'stale' | 'inactive' = 'active';
          let hotspotMessage = 'Stream is active and working';
          
          if (!isWebsocketActive) {
            hotspotStatus = 'inactive';
            hotspotMessage = 'Websocket connection lost or inactive';
          } else if (isStale) {
            hotspotStatus = 'stale';
            hotspotMessage = `Price data hasn't changed in past ${STALE_THRESHOLD / 1000} seconds; check if the websocket is working`;
          }
          
          // Show real price data
          return (
            <Card key={price.symbol} className="shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-1 pt-2 sm:pt-3 px-2 sm:px-3">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-xs font-semibold truncate">{price.instrument}</CardTitle>
                  <Hotspot 
                    status={hotspotStatus} 
                    message={hotspotMessage} 
                    websocketActive={Boolean(isWebsocketActive)}
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-0 pb-2 sm:pb-3 px-2 sm:px-3">
                <div className="space-y-1">
                  <div>
                    <p className="text-xs sm:text-sm">{formatPrice(price.currentPrice)}</p>
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 leading-tight">
                    {formatTimestamp(price.lastUpdate)}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
