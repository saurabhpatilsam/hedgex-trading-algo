import { useState, useEffect, useRef, useCallback } from 'react';

export interface AccountState {
  balance: number;
  unrealizedPl: number;
  equity: number;
  totalPL: number;
  openPL: number;
  netLiq: number;
  totalMarginUsed: number;
  availableMargin: number;
}

interface AccountStateResponse {
  success: boolean;
  data: AccountState;
  accountId: string;
  accountName: string;
  timestamp: string;
}

export function useAccountState(selectedAccount: string | null) {
  const [accountState, setAccountState] = useState<AccountState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(false);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAccountState = useCallback(async (isInitial = false) => {
    if (!selectedAccount) {
      setAccountState(null);
      return;
    }

    try {
      // Only show loading on initial fetch, not on delta updates
      if (isInitial) {
        setIsLoading(true);
      }
      // Don't clear error on every fetch - only clear on successful fetch

      const response = await fetch(`/api/account-state?account=${encodeURIComponent(selectedAccount)}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: AccountStateResponse = await response.json();
      
      if (data.success && data.data) {
        // Clear error only on successful fetch
        setError(null);
        setAccountState(data.data);
        setLastUpdate(data.timestamp);
      }
    } catch (err) {
      console.error('Error fetching account state:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch account state');
    } finally {
      if (isInitial) {
        setIsLoading(false);
      }
    }
  }, [selectedAccount]);

  // Start/stop polling based on selected account
  useEffect(() => {
    // Clear previous interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (selectedAccount) {
      // Clear previous state and show loading
      setAccountState(null);
      setError(null);
      setLastUpdate(null);
      setIsLoading(true);
      
      // Initial fetch with loading state
      fetchAccountState(true);
      
      // Set up polling every 1 second for delta updates (no loading state)
      intervalRef.current = setInterval(() => fetchAccountState(false), 1000);
    } else {
      // Clear account state when no account is selected
      setAccountState(null);
      setError(null);
      setLastUpdate(null);
      setIsLoading(false);
    }
  }, [selectedAccount, fetchAccountState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    accountState,
    isLoading,
    error,
    lastUpdate,
    refetch: fetchAccountState,
  };
}
