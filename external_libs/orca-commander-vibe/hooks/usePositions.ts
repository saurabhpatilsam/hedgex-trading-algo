import { useState, useEffect, useRef, useCallback } from 'react';

export interface Position {
  id: string;
  instrument: string;
  qty: number;
  side: 'buy' | 'sell';
  avgPrice: number;
  unrealizedPl: number;
}

interface PositionsResponse {
  success: boolean;
  positions: Position[];
  accountId: string;
  accountName: string;
  timestamp: string;
}

export function usePositions(selectedAccount: string | null) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousPositionsRef = useRef<Position[]>([]);

  const fetchPositions = useCallback(async () => {
    if (!selectedAccount) {
      setPositions([]);
      return;
    }

    try {
      setIsLoading(true);
      // Don't clear error on every fetch - only clear on successful fetch

      const response = await fetch(`/api/positions?account=${encodeURIComponent(selectedAccount)}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: PositionsResponse = await response.json();
      
      if (data.success && data.positions) {
        // Clear error only on successful fetch
        setError(null);
        
        // Transform the API response to match our Position interface
        const transformedPositions: Position[] = data.positions.map((position: any) => ({
          id: position.id,
          instrument: position.instrument,
          qty: position.qty,
          side: position.side === 'buy' ? 'buy' : 'sell',
          avgPrice: position.avgPrice,
          unrealizedPl: position.unrealizedPl,
        }));

        // Apply delta updates - only update changed positions
        setPositions(prevPositions => {
          const newPositions = [...prevPositions];
          
          transformedPositions.forEach(newPosition => {
            const existingIndex = newPositions.findIndex(p => p.id === newPosition.id);
            
            if (existingIndex >= 0) {
              // Update existing position if changed
              if (JSON.stringify(newPositions[existingIndex]) !== JSON.stringify(newPosition)) {
                newPositions[existingIndex] = newPosition;
              }
            } else {
              // Add new position
              newPositions.push(newPosition);
            }
          });

          // Remove positions that no longer exist in the API response
          const newPositionIds = new Set(transformedPositions.map(p => p.id));
          const filteredPositions = newPositions.filter(position => newPositionIds.has(position.id));

          return filteredPositions;
        });

        setLastUpdate(data.timestamp);
      }
    } catch (err) {
      console.error('Error fetching positions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch positions');
    } finally {
      setIsLoading(false);
    }
  }, [selectedAccount]);

  // Start/stop polling based on selected account
  useEffect(() => {
    if (selectedAccount) {
      // Initial fetch
      fetchPositions();
      
      // Set up polling every 0.5 seconds
      intervalRef.current = setInterval(fetchPositions, 500);
    } else {
      // Clear positions when no account is selected
      setPositions([]);
      setError(null);
      setLastUpdate(null);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [selectedAccount, fetchPositions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    positions,
    isLoading,
    error,
    lastUpdate,
    refetch: fetchPositions,
  };
}
