/**
 * Bot Management API Client
 * 
 * ⚠️ IMPORTANT: This is a REFERENCE file for the frontend team
 * Copy this to your frontend project and install dependencies:
 * 
 * npm install axios @supabase/supabase-js
 * npm install --save-dev @types/react (if using React hooks)
 * 
 * Then import React hooks if needed:
 * import { useState, useEffect, useCallback } from 'react';
 */

import axios, { AxiosInstance } from 'axios';
import {
  BotStatus,
  BotState,
  BotListResponse,
  BotDetailResponse,
  BotAction,
  BotMetric,
  HealthCheckResponse,
  BotControlRequest,
  ClearRequest,
  ControlActionResponse,
  BotManagementAPI
} from './bot-management-types';

export class BotManagementClient implements BotManagementAPI {
  private client: AxiosInstance;
  
  constructor(
    baseURL: string = 'http://localhost:8000',
    authToken?: string
  ) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { 'Authorization': `Bearer ${authToken}` })
      }
    });
    
    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.status === 401) {
          // Handle authentication error
          console.error('Authentication failed');
          // Redirect to login or refresh token
        }
        return Promise.reject(error);
      }
    );
  }
  
  /**
   * Set or update the authentication token
   */
  setAuthToken(token: string) {
    this.client.defaults.headers['Authorization'] = `Bearer ${token}`;
  }
  
  // ============= Read Operations =============
  
  /**
   * Get all bots with optional status filter
   */
  async getAllBots(status?: BotStatus): Promise<BotListResponse> {
    const params = status ? { status } : undefined;
    const response = await this.client.get<BotListResponse>('/api/bots/', { params });
    return response.data;
  }
  
  /**
   * Get detailed information for a specific bot
   */
  async getBotDetail(botId: string): Promise<BotDetailResponse> {
    const response = await this.client.get<BotDetailResponse>(`/api/bots/${botId}`);
    return response.data;
  }
  
  /**
   * Get action history for a bot
   */
  async getBotActions(botId: string, limit: number = 100): Promise<BotAction[]> {
    const response = await this.client.get<BotAction[]>(
      `/api/bots/${botId}/actions`,
      { params: { limit } }
    );
    return response.data;
  }
  
  /**
   * Get metrics history for a bot
   */
  async getBotMetrics(botId: string, limit: number = 100): Promise<BotMetric[]> {
    const response = await this.client.get<BotMetric[]>(
      `/api/bots/${botId}/metrics`,
      { params: { limit } }
    );
    return response.data;
  }
  
  /**
   * Check system health
   */
  async getHealthCheck(): Promise<HealthCheckResponse> {
    const response = await this.client.get<HealthCheckResponse>('/api/bots/health/check');
    return response.data;
  }
  
  // ============= Control Operations =============
  
  /**
   * Pause a running bot
   */
  async pauseBot(botId: string, request: BotControlRequest): Promise<ControlActionResponse> {
    const response = await this.client.post<ControlActionResponse>(
      `/api/bots/${botId}/pause`,
      request
    );
    return response.data;
  }
  
  /**
   * Resume a paused bot
   */
  async resumeBot(botId: string, request: BotControlRequest): Promise<ControlActionResponse> {
    const response = await this.client.post<ControlActionResponse>(
      `/api/bots/${botId}/resume`,
      request
    );
    return response.data;
  }
  
  /**
   * Stop a bot (terminal action)
   */
  async stopBot(botId: string, request: BotControlRequest): Promise<ControlActionResponse> {
    const response = await this.client.post<ControlActionResponse>(
      `/api/bots/${botId}/stop`,
      request
    );
    return response.data;
  }
  
  /**
   * Clear bot orders and/or positions
   */
  async clearBot(botId: string, request: ClearRequest): Promise<ControlActionResponse> {
    const params = {
      clear_orders: request.clear_orders ?? true,
      clear_positions: request.clear_positions ?? true
    };
    
    const response = await this.client.post<ControlActionResponse>(
      `/api/bots/${botId}/clear`,
      {
        performed_by: request.performed_by,
        force: request.force
      },
      { params }
    );
    return response.data;
  }
}

// ============= React Hook Example =============

/**
 * Example React hook for bot management
 */
export function useBotManagement(authToken: string) {
  const [client] = useState(() => new BotManagementClient('http://localhost:8000', authToken));
  const [bots, setBots] = useState<BotState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Fetch all bots
  const fetchBots = useCallback(async (status?: BotStatus) => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.getAllBots(status);
      setBots(response.bots);
      return response;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);
  
  // Control operations with optimistic updates
  const pauseBot = useCallback(async (botId: string, userEmail: string) => {
    // Optimistic update
    setBots(prev => prev.map(bot => 
      bot.bot_id === botId 
        ? { ...bot, status: BotStatus.PAUSED }
        : bot
    ));
    
    try {
      const response = await client.pauseBot(botId, { performed_by: userEmail });
      if (!response.success) {
        // Revert on failure
        await fetchBots();
      }
      return response;
    } catch (err) {
      // Revert on error
      await fetchBots();
      throw err;
    }
  }, [client, fetchBots]);
  
  const resumeBot = useCallback(async (botId: string, userEmail: string) => {
    // Optimistic update
    setBots(prev => prev.map(bot => 
      bot.bot_id === botId 
        ? { ...bot, status: BotStatus.RUNNING }
        : bot
    ));
    
    try {
      const response = await client.resumeBot(botId, { performed_by: userEmail });
      if (!response.success) {
        await fetchBots();
      }
      return response;
    } catch (err) {
      await fetchBots();
      throw err;
    }
  }, [client, fetchBots]);
  
  const stopBot = useCallback(async (botId: string, userEmail: string, reason?: string) => {
    // No optimistic update for stop (it's irreversible)
    const response = await client.stopBot(botId, { 
      performed_by: userEmail,
      reason 
    });
    
    if (response.success) {
      setBots(prev => prev.map(bot => 
        bot.bot_id === botId 
          ? { ...bot, status: BotStatus.STOPPED, stopped_at: new Date().toISOString() }
          : bot
      ));
    }
    
    return response;
  }, [client]);
  
  // Auto-refresh
  useEffect(() => {
    fetchBots();
    
    // Set up polling
    const interval = setInterval(() => {
      fetchBots();
    }, 5000); // Poll every 5 seconds
    
    return () => clearInterval(interval);
  }, [fetchBots]);
  
  return {
    bots,
    loading,
    error,
    fetchBots,
    pauseBot,
    resumeBot,
    stopBot,
    client
  };
}

// ============= Supabase Real-time Integration =============

import { createClient, RealtimeChannel } from '@supabase/supabase-js';

export class BotRealtimeManager {
  private supabase: any;
  private channels: Map<string, RealtimeChannel> = new Map();
  
  constructor(supabaseUrl: string, supabaseAnonKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  
  /**
   * Subscribe to bot status changes
   */
  subscribeToBotChanges(
    botId: string,
    onUpdate: (bot: BotState) => void
  ): () => void {
    const channelName = `bot-${botId}`;
    
    const channel = this.supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bots',
          filter: `bot_id=eq.${botId}`
        },
        (payload: any) => {
          onUpdate(payload.new as BotState);
        }
      )
      .subscribe();
    
    this.channels.set(channelName, channel);
    
    // Return unsubscribe function
    return () => {
      channel.unsubscribe();
      this.channels.delete(channelName);
    };
  }
  
  /**
   * Subscribe to all bot changes
   */
  subscribeToAllBots(
    onInsert?: (bot: BotState) => void,
    onUpdate?: (bot: BotState) => void,
    onDelete?: (botId: string) => void
  ): () => void {
    const channel = this.supabase
      .channel('all-bots')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bots'
        },
        (payload: any) => {
          onInsert?.(payload.new as BotState);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bots'
        },
        (payload: any) => {
          onUpdate?.(payload.new as BotState);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'bots'
        },
        (payload: any) => {
          onDelete?.(payload.old.bot_id);
        }
      )
      .subscribe();
    
    this.channels.set('all-bots', channel);
    
    return () => {
      channel.unsubscribe();
      this.channels.delete('all-bots');
    };
  }
  
  /**
   * Subscribe to bot actions
   */
  subscribeToBotActions(
    botId: string,
    onNewAction: (action: BotAction) => void
  ): () => void {
    const channelName = `bot-actions-${botId}`;
    
    const channel = this.supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bot_actions',
          filter: `bot_id=eq.${botId}`
        },
        (payload: any) => {
          onNewAction(payload.new as BotAction);
        }
      )
      .subscribe();
    
    this.channels.set(channelName, channel);
    
    return () => {
      channel.unsubscribe();
      this.channels.delete(channelName);
    };
  }
  
  /**
   * Clean up all subscriptions
   */
  cleanup() {
    this.channels.forEach(channel => channel.unsubscribe());
    this.channels.clear();
  }
}

// ============= Usage Example =============

/*
// In your React component:

import { BotManagementClient, BotRealtimeManager } from './bot-management-client';
import { useEffect, useState } from 'react';

function BotDashboard() {
  const [client] = useState(() => new BotManagementClient(
    process.env.REACT_APP_API_URL,
    localStorage.getItem('auth_token')
  ));
  
  const [realtime] = useState(() => new BotRealtimeManager(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_ANON_KEY
  ));
  
  const [bots, setBots] = useState([]);
  
  useEffect(() => {
    // Initial load
    client.getAllBots().then(response => {
      setBots(response.bots);
    });
    
    // Subscribe to real-time updates
    const unsubscribe = realtime.subscribeToAllBots(
      // On new bot
      (newBot) => {
        setBots(prev => [...prev, newBot]);
      },
      // On bot update
      (updatedBot) => {
        setBots(prev => prev.map(bot => 
          bot.bot_id === updatedBot.bot_id ? updatedBot : bot
        ));
      },
      // On bot delete
      (deletedBotId) => {
        setBots(prev => prev.filter(bot => bot.bot_id !== deletedBotId));
      }
    );
    
    return () => {
      unsubscribe();
    };
  }, [client, realtime]);
  
  const handlePause = async (botId) => {
    try {
      const response = await client.pauseBot(botId, {
        performed_by: currentUser.email
      });
      
      if (response.success) {
        toast.success(`Bot ${response.bot_id} paused`);
      }
    } catch (error) {
      toast.error('Failed to pause bot');
    }
  };
  
  return (
    <div>
      {bots.map(bot => (
        <BotCard 
          key={bot.bot_id}
          bot={bot}
          onPause={() => handlePause(bot.bot_id)}
        />
      ))}
    </div>
  );
}
*/
