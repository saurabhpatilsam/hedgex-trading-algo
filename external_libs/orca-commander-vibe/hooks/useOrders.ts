import { useState, useEffect, useRef, useCallback } from 'react';

export interface Order {
  id: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  type: 'Limit' | 'Stop' | 'Market';
  qty: number;
  limit?: number;
  stop?: number;
  fill?: number;
  takeProfit?: number;
  stopLoss?: number;
  status: 'working' | 'filled' | 'cancelled' | 'rejected';
  orderId: string;
  time: string;
}

interface OrdersResponse {
  success: boolean;
  orders: Order[];
  accountId: string;
  accountName: string;
  timestamp: string;
}

export function useOrders(selectedAccount: string | null) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousOrdersRef = useRef<Order[]>([]);

  const fetchOrders = useCallback(async () => {
    if (!selectedAccount) {
      setOrders([]);
      return;
    }

    try {
      setIsLoading(true);
      // Don't clear error on every fetch - only clear on successful fetch

      const response = await fetch(`/api/orders?account=${encodeURIComponent(selectedAccount)}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: OrdersResponse = await response.json();
      
      if (data.success && data.orders) {
        // Clear error only on successful fetch
        setError(null);
        
        // Transform the API response to match our Order interface
        const transformedOrders: Order[] = data.orders.map((order: any) => ({
          id: order.id,
          symbol: order.instrument,
          side: order.side === 'buy' ? 'Buy' : 'Sell',
          type: order.type === 'limit' ? 'Limit' : order.type === 'stop' ? 'Stop' : 'Market',
          qty: order.qty,
          limit: order.limitPrice,
          stop: order.stopPrice,
          fill: order.fillPrice,
          takeProfit: order.takeProfit,
          stopLoss: order.stopLoss,
          status: order.status,
          orderId: order.id,
          time: new Date(order.lastModified * 1000).toISOString(), // Convert Unix timestamp
        }));

        // Apply delta updates - only update changed orders
        setOrders(prevOrders => {
          const newOrders = [...prevOrders];
          
          transformedOrders.forEach(newOrder => {
            const existingIndex = newOrders.findIndex(o => o.id === newOrder.id);
            
            if (existingIndex >= 0) {
              // Update existing order if changed
              if (JSON.stringify(newOrders[existingIndex]) !== JSON.stringify(newOrder)) {
                newOrders[existingIndex] = newOrder;
              }
            } else {
              // Add new order
              newOrders.push(newOrder);
            }
          });

          // Remove orders that no longer exist in the API response
          const newOrderIds = new Set(transformedOrders.map(o => o.id));
          const filteredOrders = newOrders.filter(order => newOrderIds.has(order.id));

          // Sort by time in descending order (latest first)
          return filteredOrders.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        });

        setLastUpdate(data.timestamp);
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch orders');
    } finally {
      setIsLoading(false);
    }
  }, [selectedAccount]);

  // Start/stop polling based on selected account
  useEffect(() => {
    if (selectedAccount) {
      // Initial fetch
      fetchOrders();
      
      // Set up polling every 0.5 seconds
      intervalRef.current = setInterval(fetchOrders, 500);
    } else {
      // Clear orders when no account is selected
      setOrders([]);
      setError(null);
      setLastUpdate(null);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [selectedAccount, fetchOrders]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    orders,
    isLoading,
    error,
    lastUpdate,
    refetch: fetchOrders,
  };
}
