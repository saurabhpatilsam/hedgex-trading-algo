/**
 * Run Configuration API Client
 * 
 * Client for fetching and managing bot run configurations
 * This shows historical and active bot runs
 */

// Note: Run `npm install axios` if not already installed
import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import {
  RunConfig,
  RunConfigStatus,
  RunConfigListResponse,
  DuplicateCheckRequest,
  DuplicateCheckResponse,
  UpdateStatusRequest
} from './run-config-types';

/**
 * API Error interface
 */
interface APIError {
  detail?: string;
  message?: string;
}

/**
 * Run Configuration API Client
 * 
 * Example usage:
 * ```typescript
 * const client = new RunConfigClient('http://localhost:8000', authToken);
 * const configs = await client.getAllConfigs();
 * const activeRuns = await client.getActiveConfigs();
 * ```
 */
export class RunConfigClient {
  private api: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string, authToken?: string, timeout: number = 30000) {
    this.baseUrl = baseUrl;
    
    this.api = axios.create({
      baseURL: `${baseUrl}/api/v1/run-bot`,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { 'Authorization': `Bearer ${authToken}` })
      }
    });

    // Add response interceptor for error handling
    this.api.interceptors.response.use(
      (response: AxiosResponse) => response,
      (error: AxiosError<APIError>) => {
        return Promise.reject(this.handleError(error));
      }
    );
  }

  /**
   * Update authentication token
   */
  setAuthToken(token: string): void {
    this.api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Remove authentication token
   */
  clearAuthToken(): void {
    delete this.api.defaults.headers.common['Authorization'];
  }

  // ==========================================================================
  // QUERY METHODS
  // ==========================================================================

  /**
   * Get all run configurations with optional status filter
   * 
   * @param status - Optional status filter (e.g., "running", "completed")
   * @returns List of run configurations
   */
  async getAllConfigs(status?: RunConfigStatus | string): Promise<RunConfig[]> {
    const params = status ? { status } : undefined;
    const response = await this.api.get<RunConfig[]>('/configs', { params });
    return response.data;
  }

  /**
   * Get all active (running) run configurations
   * 
   * @returns List of active run configurations
   */
  async getActiveConfigs(): Promise<RunConfig[]> {
    const response = await this.api.get<RunConfig[]>('/configs/active');
    return response.data;
  }

  /**
   * Get a specific run configuration by ID
   * 
   * @param runId - The run ID
   * @returns Run configuration details
   */
  async getConfigById(runId: number): Promise<RunConfig> {
    const response = await this.api.get<RunConfig>(`/configs/${runId}`);
    return response.data;
  }

  /**
   * Get duplicate configurations for a specific run
   * 
   * @param runId - The run ID to check for duplicates
   * @returns List of duplicate configurations
   */
  async getConfigDuplicates(runId: number): Promise<RunConfig[]> {
    const response = await this.api.get<RunConfig[]>(`/configs/${runId}/duplicates`);
    return response.data;
  }

  // ==========================================================================
  // CONTROL METHODS
  // ==========================================================================

  /**
   * Update the status of a run configuration
   * 
   * @param runId - The run ID
   * @param status - New status to set
   * @returns Updated run configuration
   */
  async updateConfigStatus(runId: number, status: string): Promise<RunConfig> {
    const response = await this.api.patch<RunConfig>(
      `/configs/${runId}/status`,
      { status }
    );
    return response.data;
  }

  /**
   * Stop a running configuration
   * 
   * @param runId - The run ID to stop
   * @returns Updated run configuration
   */
  async stopConfig(runId: number): Promise<RunConfig> {
    return this.updateConfigStatus(runId, 'stopped');
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Check if a strategy configuration has duplicates
   * 
   * @param config - Strategy configuration to check
   * @returns Duplicate check result
   */
  async checkDuplicateConfig(config: DuplicateCheckRequest): Promise<DuplicateCheckResponse> {
    const response = await this.api.post<DuplicateCheckResponse>(
      '/configs/check-duplicate',
      config
    );
    return response.data;
  }

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  /**
   * Handle and format API errors
   */
  private handleError(error: AxiosError<APIError>): Error {
    if (error.response) {
      const { status, data } = error.response;
      
      if (status === 404) {
        return new Error(data.detail || 'Run configuration not found');
      }
      
      if (status === 400) {
        return new Error(data.message || data.detail || 'Invalid request');
      }
      
      if (status === 401) {
        return new Error('Unauthorized - Please check your authentication token');
      }
      
      if (status === 403) {
        return new Error('Forbidden - You do not have permission to perform this action');
      }
      
      if (status === 500) {
        return new Error(data.detail || 'Internal server error');
      }
      
      return new Error(data.message || data.detail || `API error: ${status}`);
    }
    
    if (error.request) {
      return new Error('No response from server - Please check your connection');
    }
    
    return new Error(error.message || 'Unknown error occurred');
  }
}

// ============================================================================
// REACT HOOKS
// ============================================================================

import * as React from 'react';

/**
 * React hook for run configurations
 * 
 * Example usage:
 * ```typescript
 * const { configs, loading, error, refresh } = useRunConfigs(client);
 * ```
 */
export function useRunConfigs(client: RunConfigClient, status?: RunConfigStatus) {
  const [configs, setConfigs] = React.useState<RunConfig[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchConfigs = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await client.getAllConfigs(status);
      setConfigs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch run configurations');
    } finally {
      setLoading(false);
    }
  }, [client, status]);

  const stopConfig = React.useCallback(async (runId: number) => {
    setLoading(true);
    setError(null);
    try {
      await client.stopConfig(runId);
      await fetchConfigs(); // Refresh list
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to stop run';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [client, fetchConfigs]);

  const refresh = React.useCallback(() => {
    return fetchConfigs();
  }, [fetchConfigs]);

  // Auto-fetch on mount
  React.useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  return {
    configs,
    loading,
    error,
    refresh,
    stopConfig
  };
}

/**
 * React hook for active run configurations
 * 
 * Example usage:
 * ```typescript
 * const { activeConfigs, loading, error } = useActiveConfigs(client);
 * ```
 */
export function useActiveConfigs(client: RunConfigClient) {
  const [configs, setConfigs] = React.useState<RunConfig[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchConfigs = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await client.getActiveConfigs();
      setConfigs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch active configurations');
    } finally {
      setLoading(false);
    }
  }, [client]);

  const refresh = React.useCallback(() => {
    return fetchConfigs();
  }, [fetchConfigs]);

  // Auto-fetch on mount
  React.useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  return {
    activeConfigs: configs,
    loading,
    error,
    refresh
  };
}

/**
 * React hook for single run configuration
 * 
 * Example usage:
 * ```typescript
 * const { config, loading, error, refresh } = useRunConfig(client, runId);
 * ```
 */
export function useRunConfig(client: RunConfigClient, runId: number) {
  const [config, setConfig] = React.useState<RunConfig | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchConfig = React.useCallback(async () => {
    if (!runId) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await client.getConfigById(runId);
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch run configuration');
    } finally {
      setLoading(false);
    }
  }, [client, runId]);

  const refresh = React.useCallback(() => {
    return fetchConfig();
  }, [fetchConfig]);

  // Auto-fetch on mount and when runId changes
  React.useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return {
    config,
    loading,
    error,
    refresh
  };
}

/**
 * React hook for real-time run config updates via polling
 * 
 * Example usage:
 * ```typescript
 * const { configs } = useRealtimeConfigs(client, 5000); // Poll every 5 seconds
 * ```
 */
export function useRealtimeConfigs(
  client: RunConfigClient,
  intervalMs: number = 5000,
  status?: RunConfigStatus
) {
  const [configs, setConfigs] = React.useState<RunConfig[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isActive = true;

    const fetchConfigs = async () => {
      try {
        const data = await client.getAllConfigs(status);
        if (isActive) {
          setConfigs(data);
          setError(null);
        }
      } catch (err) {
        if (isActive) {
          setError(err instanceof Error ? err.message : 'Failed to fetch run configurations');
        }
      }
    };

    // Initial fetch
    fetchConfigs();

    // Set up polling
    const interval = setInterval(fetchConfigs, intervalMs);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [client, intervalMs, status]);

  return { configs, error };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a run config client with environment variables
 */
export function createRunConfigClient(authToken?: string): RunConfigClient {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
  return new RunConfigClient(baseUrl, authToken);
}
