'use client';

import { useState, useEffect } from 'react';
import { Play, RefreshCw, AlertTriangle, Clock, Copy } from 'lucide-react';
import { RunConfig, OrcaMaxConfig } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useActiveRunConfigs } from '@/hooks/useRunConfigs';
import { toast } from 'sonner';
import { OrcaMaxConfigForm } from './orcamax-config-form';

export function RunningConfigsTab() {
  const { configs, isLoading, error, lastUpdate, hasResponded, refetch } = useActiveRunConfigs();
  const [selectedConfig, setSelectedConfig] = useState<RunConfig | null>(null);
  const [showConfigForm, setShowConfigForm] = useState(false);
  
  // Fetch available accounts from API
  const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        setAccountsLoading(true);
        const response = await fetch('/api/accounts');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.accounts?.length > 0) {
            setAvailableAccounts(data.accounts);
          } else {
            // Fallback to default accounts if no accounts from API
            setAvailableAccounts(['APEX_136189', 'APEX_265995', 'APEX_266668', 'APEX_272045']);
          }
        } else {
          // Fallback to default accounts on error
          setAvailableAccounts(['APEX_136189', 'APEX_265995', 'APEX_266668', 'APEX_272045']);
        }
      } catch (error) {
        console.error('Failed to fetch accounts:', error);
        // Fallback to default accounts on error
        setAvailableAccounts(['APEX_136189', 'APEX_265995', 'APEX_266668', 'APEX_272045']);
      } finally {
        setAccountsLoading(false);
      }
    };
    
    fetchAccounts();
  }, []);

  // Sort by most recent first
  const sortedConfigs = [...configs].sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return timeB - timeA;
  });

  const handleSelectConfig = (config: RunConfig) => {
    setSelectedConfig(config);
    setShowConfigForm(true);
  };

  const handleCancelConfig = () => {
    setShowConfigForm(false);
    setSelectedConfig(null);
  };

  const convertRunConfigToOrcaMax = (runConfig: RunConfig): OrcaMaxConfig => {
    return {
      accountName: runConfig.account_name || 'APEX_136189',
      contract: runConfig.instrument_name as any,
      trading_mode: runConfig.way,
      trading_side: runConfig.point_type,
      point_strategy_key: runConfig.point_strategy_key,
      point_position: runConfig.point_position,
      exit_strategy_key: runConfig.exit_strategy_key,
      dateFrom: runConfig.dateFrom || new Date().toISOString().slice(0, 16),
      dateTo: runConfig.dateTo || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      quantity: runConfig.quantity || 1,
      environment: runConfig.environment || 'DEV',
      accounts_ids: '',
      notes: runConfig.notes || '',
    };
  };

  const handleOrcaMaxSubmit = async (config: OrcaMaxConfig) => {
    try {
      // Get auth token from localStorage
      const token = localStorage.getItem('access_token');
      
      if (!token) {
        toast.error('Not authenticated', {
          description: 'Please sign in to deploy bots',
        });
        return;
      }

      const response = await fetch('/api/bots/create/orcamax', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Add auth token
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        toast.success('Bot deployed successfully!');
        setShowConfigForm(false);
        setSelectedConfig(null);
        // Refresh configs list
        setTimeout(() => refetch(), 1000);
      } else {
        throw new Error(data.error || 'Failed to deploy bot');
      }
    } catch (error) {
      console.error('Error deploying bot:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to deploy bot');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'running':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'completed':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'failed':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'stopped':
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
      default:
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // If showing config form, render it instead of the main view
  if (showConfigForm && selectedConfig) {
    return (
      <OrcaMaxConfigForm
        onSubmit={handleOrcaMaxSubmit}
        onCancel={handleCancelConfig}
        availableAccounts={availableAccounts}
        initialConfig={convertRunConfigToOrcaMax(selectedConfig)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
        <div>
          <h2 className="text-xl font-bold">Running Configurations</h2>
          <p className="text-sm text-muted-foreground">
            View active trading configurations and create new runs based on them
          </p>
          {error && (
            <p className="text-xs text-red-600 mt-1">
              Error: {error}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            size="sm" 
            onClick={refetch}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Badge variant="outline" className="text-xs">
            {sortedConfigs.filter(c => c.status?.toLowerCase() === 'running').length} Running
          </Badge>
          {lastUpdate && (
            <Badge variant="outline" className="text-xs">
              Updated {formatDate(lastUpdate.toISOString())}
            </Badge>
          )}
        </div>
      </div>

      <div className="bg-white border rounded-lg shadow-sm p-3 sm:p-4">
        {/* Initial Loading State */}
        {!hasResponded && isLoading && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading configurations...</span>
          </div>
        )}
        
        {/* Error State */}
        {error && sortedConfigs.length === 0 && hasResponded && (
          <div className="flex items-center justify-center py-8">
            <AlertTriangle className="h-6 w-6 text-red-500" />
            <span className="ml-2 text-sm text-red-600">{error}</span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={refetch}
              className="ml-4"
            >
              Retry
            </Button>
          </div>
        )}
        
        {/* Empty State */}
        {sortedConfigs.length === 0 && hasResponded && !error && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Clock className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground text-center">No active configurations found</p>
            <p className="text-xs text-muted-foreground/70 mt-1 text-center px-4">
              Active configurations will appear here when trading strategies are running
            </p>
          </div>
        )}
        
        {/* Configurations Grid */}
        {sortedConfigs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedConfigs.map((config) => (
              <Card key={config.id} className="shadow-md hover:shadow-lg transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <CardTitle className="text-sm truncate">
                            Config #{config.id}
                          </CardTitle>
                          <Badge 
                            variant="outline" 
                            className={`${getStatusColor(config.status)} border text-xs`}
                          >
                            {config.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {config.account_name || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-0 pb-3">
                  {/* Configuration Details */}
                  <div className="space-y-2 text-xs mb-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-muted-foreground">Instrument</p>
                        <p className="font-semibold">{config.instrument_name}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Mode</p>
                        <p className="font-semibold">{config.way}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-muted-foreground">Side</p>
                        <p className="font-semibold">{config.point_type}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Position</p>
                        <p className="font-semibold">{config.point_position.toUpperCase()}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-muted-foreground">Point Strategy</p>
                        <p className="font-mono text-xs truncate">{config.point_strategy_key}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Exit Strategy</p>
                        <p className="font-mono text-xs truncate">{config.exit_strategy_key}</p>
                      </div>
                    </div>
                    
                    {config.created_at && (
                      <div>
                        <p className="text-muted-foreground">Created</p>
                        <p className="text-xs">{formatDate(config.created_at)}</p>
                      </div>
                    )}
                    
                    {config.user && (
                      <div>
                        <p className="text-muted-foreground">User</p>
                        <p className="text-xs">{config.user}</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Action Button */}
                  <Button 
                    size="sm" 
                    className="w-full gap-2"
                    onClick={() => handleSelectConfig(config)}
                  >
                    <Copy className="h-3 w-3" />
                    Use This Config
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
