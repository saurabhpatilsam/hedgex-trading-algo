import { useState, useEffect, useCallback } from 'react';
import { RunConfig } from '@/lib/types';

interface UseRunConfigsResult {
  configs: RunConfig[];
  isLoading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  hasResponded: boolean;
  refetch: () => Promise<void>;
}

export function useRunConfigs(status?: string): UseRunConfigsResult {
  const [configs, setConfigs] = useState<RunConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [hasResponded, setHasResponded] = useState(false);

  const fetchConfigs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      let url = '/api/run-configs';
      if (status) {
        url += `?status=${encodeURIComponent(status)}`;
      }
      
      const response = await fetch(url);
      const data = await response.json();

      setHasResponded(true);

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch run configurations');
      }

      setConfigs(data.configs || []);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error fetching run configurations:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch run configurations');
      setConfigs([]);
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  return {
    configs,
    isLoading,
    error,
    lastUpdate,
    hasResponded,
    refetch: fetchConfigs,
  };
}

export function useActiveRunConfigs(): UseRunConfigsResult {
  const [configs, setConfigs] = useState<RunConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [hasResponded, setHasResponded] = useState(false);

  const fetchConfigs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/run-configs/active');
      const data = await response.json();

      setHasResponded(true);

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch active run configurations');
      }

      setConfigs(data.configs || []);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error fetching active run configurations:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch active run configurations');
      setConfigs([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
    
    // Poll every 10 seconds for updates
    const interval = setInterval(fetchConfigs, 10000);
    
    return () => clearInterval(interval);
  }, [fetchConfigs]);

  return {
    configs,
    isLoading,
    error,
    lastUpdate,
    hasResponded,
    refetch: fetchConfigs,
  };
}
