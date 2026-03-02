/**
 * Bot Management System - API Client
 * 
 * Complete API client for interacting with the bot management backend
 */

// Note: Run `npm install axios` if not already installed
import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import {
  BotManagementAPI,
  BotManagementClientConfig,
  ListBotsResponse,
  BotDetailsResponse,
  BotActionResponse,
  BotActionResult,
  ClearBotResponse,
  HealthCheckResponse,
  PauseBotRequest,
  ResumeBotRequest,
  StopBotRequest,
  ClearBotRequest,
  BotStatus,
  APIError
} from './types';

/**
 * Bot Management API Client
 * 
 * Example usage:
 * ```typescript
 * const client = new BotManagementClient('http://localhost:8000', authToken);
 * const { bots } = await client.getAllBots();
 * await client.pauseBot(botId, { performed_by: userEmail });
 * ```
 */
export class BotManagementClient implements BotManagementAPI {
  private api: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string, authToken?: string, timeout: number = 30000) {
    this.baseUrl = baseUrl;
    
    this.api = axios.create({
      baseURL: `${baseUrl}/api/bots`,
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
   * Get all bots with optional status filter
   * 
   * @param status - Optional status filter (e.g., "running", "paused")
   * @returns List of all bots with summary statistics
   */
  async getAllBots(status?: BotStatus): Promise<ListBotsResponse> {
    const params = status ? { status } : undefined;
    const response = await this.api.get<ListBotsResponse>('/', { params });
    return response.data;
  }

  /**
   * Get detailed information about a specific bot
   * 
   * @param botId - The bot ID to retrieve
   * @returns Bot details and recent actions
   */
  async getBotDetails(botId: string): Promise<BotDetailsResponse> {
    const response = await this.api.get<BotDetailsResponse>(`/${botId}`);
    return response.data;
  }

  /**
   * Get action history for a specific bot
   * 
   * @param botId - The bot ID
   * @param limit - Maximum number of actions to return (default: 100)
   * @returns Array of bot actions
   */
  async getBotActions(botId: string, limit: number = 100): Promise<BotActionResponse[]> {
    const response = await this.api.get<BotActionResponse[]>(`/${botId}/actions`, {
      params: { limit }
    });
    return response.data;
  }

  // ==========================================================================
  // CONTROL METHODS
  // ==========================================================================

  /**
   * Pause a running bot
   * 
   * The bot will check its status every 5 seconds and pause execution.
   * Actual pause occurs within 5 seconds of this request.
   * 
   * @param botId - The bot ID to pause
   * @param request - Pause request with user info and optional reason
   * @returns Action result with new status
   * @throws Error if bot is not running
   */
  async pauseBot(botId: string, request: PauseBotRequest): Promise<BotActionResult> {
    const response = await this.api.post<BotActionResult>(`/${botId}/pause`, request);
    return response.data;
  }

  /**
   * Resume a paused bot
   * 
   * Bot will immediately continue trading operations.
   * 
   * @param botId - The bot ID to resume
   * @param request - Resume request with user info
   * @returns Action result with new status
   * @throws Error if bot is not paused
   */
  async resumeBot(botId: string, request: ResumeBotRequest): Promise<BotActionResult> {
    const response = await this.api.post<BotActionResult>(`/${botId}/resume`, request);
    return response.data;
  }

  /**
   * Stop a bot permanently
   * 
   * This is a terminal state - the bot cannot be resumed after stopping.
   * A new bot instance must be started instead.
   * 
   * @param botId - The bot ID to stop
   * @param request - Stop request with user info and optional reason
   * @returns Action result with new status
   */
  async stopBot(botId: string, request: StopBotRequest): Promise<BotActionResult> {
    const response = await this.api.post<BotActionResult>(`/${botId}/stop`, request);
    return response.data;
  }

  // ==========================================================================
  // MAINTENANCE METHODS
  // ==========================================================================

  /**
   * Clear orders and/or positions for a bot
   * 
   * @param botId - The bot ID
   * @param request - Clear request with user info
   * @param clearOrders - Whether to clear pending orders (default: true)
   * @param clearPositions - Whether to clear open positions (default: true)
   * @returns Result indicating what was cleared
   */
  async clearBot(
    botId: string,
    request: ClearBotRequest,
    clearOrders: boolean = true,
    clearPositions: boolean = true
  ): Promise<ClearBotResponse> {
    const response = await this.api.post<ClearBotResponse>(`/${botId}/clear`, request, {
      params: {
        clear_orders: clearOrders,
        clear_positions: clearPositions
      }
    });
    return response.data;
  }

  // ==========================================================================
  // HEALTH & STATUS
  // ==========================================================================

  /**
   * Check system health
   * 
   * @returns Health check information
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    const response = await this.api.get<HealthCheckResponse>('/health/check');
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
      
      // Handle specific error cases
      if (status === 404) {
        return new Error(data.detail || 'Bot not found');
      }
      
      if (status === 400) {
        const message = data.message || data.detail || 'Invalid request';
        return new Error(message);
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
// REACT HOOKS (Optional)
// ============================================================================

/**
 * React hook for bot management operations
 * 
 * Example usage:
 * ```typescript
 * const { bots, loading, error, refresh, pauseBot, resumeBot } = useBotManagement(client);
 * ```
 */
export function useBotManagement(client: BotManagementClient) {
  const [bots, setBots] = React.useState<ListBotsResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * Fetch all bots
   */
  const fetchBots = React.useCallback(async (status?: BotStatus) => {
    setLoading(true);
    setError(null);
    try {
      const data = await client.getAllBots(status);
      setBots(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch bots');
    } finally {
      setLoading(false);
    }
  }, [client]);

  /**
   * Pause a bot
   */
  const pauseBot = React.useCallback(async (botId: string, performedBy: string, reason?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.pauseBot(botId, { performed_by: performedBy, reason });
      await fetchBots(); // Refresh list
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to pause bot';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [client, fetchBots]);

  /**
   * Resume a bot
   */
  const resumeBot = React.useCallback(async (botId: string, performedBy: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.resumeBot(botId, { performed_by: performedBy });
      await fetchBots(); // Refresh list
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to resume bot';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [client, fetchBots]);

  /**
   * Stop a bot
   */
  const stopBot = React.useCallback(async (botId: string, performedBy: string, reason?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.stopBot(botId, { performed_by: performedBy, reason });
      await fetchBots(); // Refresh list
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to stop bot';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [client, fetchBots]);

  /**
   * Refresh bot list
   */
  const refresh = React.useCallback(() => {
    return fetchBots();
  }, [fetchBots]);

  // Auto-fetch on mount
  React.useEffect(() => {
    fetchBots();
  }, [fetchBots]);

  return {
    bots,
    loading,
    error,
    refresh,
    pauseBot,
    resumeBot,
    stopBot,
    fetchBots
  };
}

/**
 * React hook for single bot details
 * 
 * Example usage:
 * ```typescript
 * const { bot, actions, loading, error, refresh } = useBotDetails(client, botId);
 * ```
 */
export function useBotDetails(client: BotManagementClient, botId: string) {
  const [bot, setBot] = React.useState<BotDetailsResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * Fetch bot details
   */
  const fetchBot = React.useCallback(async () => {
    if (!botId) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await client.getBotDetails(botId);
      setBot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch bot details');
    } finally {
      setLoading(false);
    }
  }, [client, botId]);

  /**
   * Refresh bot details
   */
  const refresh = React.useCallback(() => {
    return fetchBot();
  }, [fetchBot]);

  // Auto-fetch on mount and when botId changes
  React.useEffect(() => {
    fetchBot();
  }, [fetchBot]);

  return {
    bot: bot?.bot,
    actions: bot?.recent_actions,
    loading,
    error,
    refresh
  };
}

/**
 * React hook for real-time bot updates via polling
 * 
 * Example usage:
 * ```typescript
 * const { bots } = useRealtimeBots(client, 5000); // Poll every 5 seconds
 * ```
 */
export function useRealtimeBots(
  client: BotManagementClient,
  intervalMs: number = 5000,
  status?: BotStatus
) {
  const [bots, setBots] = React.useState<ListBotsResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isActive = true;

    const fetchBots = async () => {
      try {
        const data = await client.getAllBots(status);
        if (isActive) {
          setBots(data);
          setError(null);
        }
      } catch (err) {
        if (isActive) {
          setError(err instanceof Error ? err.message : 'Failed to fetch bots');
        }
      }
    };

    // Initial fetch
    fetchBots();

    // Set up polling
    const interval = setInterval(fetchBots, intervalMs);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [client, intervalMs, status]);

  return { bots, error };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a bot management client with environment variables
 */
export function createBotManagementClient(authToken?: string): BotManagementClient {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
  return new BotManagementClient(baseUrl, authToken);
}

/**
 * Type guard to check if error is an API error
 */
export function isAPIError(error: any): error is APIError {
  return error && (
    typeof error.detail === 'string' ||
    typeof error.message === 'string' ||
    typeof error.success === 'boolean'
  );
}

// Export React for hooks (if using)
import * as React from 'react';
