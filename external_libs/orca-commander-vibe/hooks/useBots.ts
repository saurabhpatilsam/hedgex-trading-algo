import { useState, useEffect, useRef, useCallback } from 'react';
import { OrcaMaxConfig, BonucciConfig } from '@/lib/types';

export interface BotState {
  bot_id: string;
  bot_type?: 'orcamax' | 'bonucci';
  status: 'running' | 'stopped' | 'error' | 'paused';
  start_time: string;
  last_health_check: string;
  instrument: string;
  account_name: string;
  total_pnl: number;
  open_positions: number;
  closed_positions: number;
  active_orders: number;
  won_orders?: number;
  lost_orders?: number;
  fibonacci_levels: Record<string, number>;
  trading_window_active: boolean;
  threshold_reached: boolean;
  config?: OrcaMaxConfig | BonucciConfig | any; // Allow any for flexibility
}

interface BotsResponse {
  success: boolean;
  bots: BotState[];
  timestamp: string;
}

export function useBots() {
  const [bots, setBots] = useState<BotState[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [hasResponded, setHasResponded] = useState(false);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousBotsRef = useRef<BotState[]>([]);

  const fetchBots = useCallback(async () => {
    try {
      setIsLoading(true);

      // Get auth token from localStorage
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      
      const response = await fetch('/api/bots', {
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: BotsResponse = await response.json();
      
      if (data.success && data.bots) {
        setError(null);
        
        // Apply delta updates - only update changed bots
        setBots(prevBots => {
          const newBots = [...prevBots];
          
          data.bots.forEach(newBot => {
            const existingIndex = newBots.findIndex(b => b.bot_id === newBot.bot_id);
            
            if (existingIndex >= 0) {
              // Update existing bot if changed
              if (JSON.stringify(newBots[existingIndex]) !== JSON.stringify(newBot)) {
                newBots[existingIndex] = newBot;
              }
            } else {
              // Add new bot
              newBots.push(newBot);
            }
          });

          // Remove bots that no longer exist in the API response
          const newBotIds = new Set(data.bots.map(b => b.bot_id));
          const filteredBots = newBots.filter(bot => newBotIds.has(bot.bot_id));

          // Sort by start time in descending order (latest first)
          return filteredBots.sort((a, b) => {
            const timeA = new Date(a.start_time).getTime();
            const timeB = new Date(b.start_time).getTime();
            return timeB - timeA;
          });
        });

        setLastUpdate(data.timestamp);
      }
      
      // Mark that we've received a response (success or failure)
      setHasResponded(true);
    } catch (err) {
      console.error('Error fetching bots:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch bots');
      setHasResponded(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Start polling on mount
  useEffect(() => {
    // Initial fetch
    fetchBots();
    
    // Set up polling every 5 seconds (bot configs change less frequently than orders)
    intervalRef.current = setInterval(fetchBots, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchBots]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    bots,
    isLoading,
    error,
    lastUpdate,
    hasResponded,
    refetch: fetchBots,
  };
}
