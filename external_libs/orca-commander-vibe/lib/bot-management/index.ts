/**
 * Bot Management System - Unified Export
 * 
 * Central export point for all bot management functionality
 */

// ============================================================================
// BOT CONTROL (Pause/Resume/Stop active bots)
// ============================================================================

export * from './types';
export * from './client';

// ============================================================================
// RUN CONFIGURATIONS (View historical and active bot runs)
// ============================================================================

export * from './run-config-types';
export * from './run-config-client';

// ============================================================================
// UNIFIED CLIENT
// ============================================================================

import { BotManagementClient } from './client';
import { RunConfigClient } from './run-config-client';

/**
 * Unified client for both bot control and run configuration management
 * 
 * Example usage:
 * ```typescript
 * const client = new UnifiedBotClient(baseUrl, authToken);
 * 
 * // Bot control
 * const { bots } = await client.control.getAllBots();
 * await client.control.pauseBot(botId, { performed_by: email });
 * 
 * // Run configs
 * const configs = await client.runs.getAllConfigs();
 * const activeRuns = await client.runs.getActiveConfigs();
 * ```
 */
export class UnifiedBotClient {
  public control: BotManagementClient;
  public runs: RunConfigClient;

  constructor(baseUrl: string, authToken?: string, timeout: number = 30000) {
    this.control = new BotManagementClient(baseUrl, authToken, timeout);
    this.runs = new RunConfigClient(baseUrl, authToken, timeout);
  }

  /**
   * Update authentication token for both clients
   */
  setAuthToken(token: string): void {
    this.control.setAuthToken(token);
    this.runs.setAuthToken(token);
  }

  /**
   * Clear authentication token from both clients
   */
  clearAuthToken(): void {
    this.control.clearAuthToken();
    this.runs.clearAuthToken();
  }
}

/**
 * Create a unified client with environment variables
 */
export function createUnifiedBotClient(authToken?: string): UnifiedBotClient {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
  return new UnifiedBotClient(baseUrl, authToken);
}

// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================

// Main clients
export { BotManagementClient, createBotManagementClient } from './client';
export { RunConfigClient, createRunConfigClient } from './run-config-client';

// React hooks - Bot Control
export {
  useBotManagement,
  useBotDetails,
  useRealtimeBots
} from './client';

// React hooks - Run Configs
export {
  useRunConfigs,
  useActiveConfigs,
  useRunConfig,
  useRealtimeConfigs
} from './run-config-client';
