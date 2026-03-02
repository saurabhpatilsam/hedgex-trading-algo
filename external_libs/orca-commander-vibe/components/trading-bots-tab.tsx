import { useState, useEffect } from 'react';
import { Play, Pause, AlertTriangle, Clock, Activity, RefreshCw, Circle, Bot, Plus, Filter, ChevronLeft, ChevronRight, Calendar, X, BookOpen, Archive as ArchiveIcon, Settings2, CheckSquare, Square } from 'lucide-react';
import { TradingBot, BotType, OrcaMaxConfig } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useBots } from '@/hooks/useBots';
import { toast } from 'sonner';
import { BotCreationDialog } from './bot-creation-dialog';
import { OrcaMaxConfigForm } from './orcamax-config-form';
import { BonucciConfigForm } from './bonucci-config-form';
import { BotConfigDetails } from './bot-config-details';
import { PremiumBotCard } from './premium-bot-card';
import { BotActionConfirmationDialog } from './bot-action-confirmation-dialog';
import { Info } from 'lucide-react';
import { ConfigLibrary } from './config-library';
import { ArchivedBotsTab } from './archived-bots-tab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


export function TradingBotsTab() {
  const { bots, isLoading, error, lastUpdate, hasResponded, refetch } = useBots();
  const [showCreationDialog, setShowCreationDialog] = useState(false);
  const [selectedBotType, setSelectedBotType] = useState<BotType | null>(null);
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [selectedBotForDetails, setSelectedBotForDetails] = useState<TradingBot | null>(null);
  const [showBotDetails, setShowBotDetails] = useState(false);
  
  // Confirmation dialog state
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationBot, setConfirmationBot] = useState<TradingBot | null>(null);
  const [confirmationAction, setConfirmationAction] = useState<'start' | 'stop' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Filter and pagination state
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'stopped' | 'paused' | 'error'>('all');
  const [botTypeFilter, setBotTypeFilter] = useState<'all' | 'orcamax' | 'bonucci' | 'fibonacci'>('all');
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  
  // Date filter state
  const [dateFilterType, setDateFilterType] = useState<'none' | 'specific' | 'range'>('none');
  const [specificDate, setSpecificDate] = useState<string>('');
  const [dateRangeStart, setDateRangeStart] = useState<string>('');
  const [dateRangeEnd, setDateRangeEnd] = useState<string>('');
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [showConfigLibrary, setShowConfigLibrary] = useState(false);
  const [activeTab, setActiveTab] = useState('active');
  
  // Bulk actions state
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [selectedBots, setSelectedBots] = useState<Set<string>>(new Set());
  
  // Add function to handle config deployment from library
  const handleRunConfigFromLibrary = async (config: any) => {
    try {
      if (config.bot_type === 'orcamax') {
        // Handle OrcaMax deployment
        await handleOrcaMaxSubmit(config.config);
      } else {
        toast.error('Unsupported bot type for direct deployment');
      }
      setShowConfigLibrary(false);
    } catch (error) {
      toast.error('Failed to deploy configuration');
    }
  };
  
  // Add function to handle bot archiving
  const handleArchiveBot = async (bot: TradingBot) => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`/api/bots/${bot.bot_id}/archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({ 
          reason: bot.status === 'error' ? 'error' : 'manual',
          archived_by: 'user' 
        }),
      });

      if (response.ok) {
        toast.success('Bot archived successfully');
        refetch();
      } else {
        throw new Error('Failed to archive bot');
      }
    } catch (error) {
      toast.error('Failed to archive bot');
    }
  };
  
  // Add function to handle bot restart
  const handleRestartBot = async (bot: TradingBot) => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`/api/bots/restart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({
          bot_id: bot.bot_id,
          config: bot.config,
          bot_type: bot.bot_type,
        }),
      });

      if (response.ok) {
        toast.success('Bot restarted successfully');
        refetch();
      } else {
        throw new Error('Failed to restart bot');
      }
    } catch (error) {
      toast.error('Failed to restart bot');
    }
  };
  
  // Bulk action handlers
  const handleBulkStop = async () => {
    const botIds = Array.from(selectedBots);
    const runningBots = paginatedBots.filter(bot => 
      botIds.includes(bot.bot_id) && bot.status === 'running'
    );
    
    if (runningBots.length === 0) {
      toast.error('No running bots selected');
      return;
    }
    
    try {
      const results = await Promise.allSettled(
        runningBots.map(bot => handleStop(bot.bot_id))
      );
      
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      if (succeeded > 0) {
        toast.success(`Stopped ${succeeded} bot(s)${failed > 0 ? `, ${failed} failed` : ''}`);
      }
      if (failed > 0 && succeeded === 0) {
        toast.error(`Failed to stop ${failed} bot(s)`);
      }
      
      setSelectedBots(new Set());
      setShowBulkActions(false);
      refetch();
    } catch (error) {
      toast.error('Failed to stop selected bots');
    }
  };
  
  const handleBulkStart = async () => {
    const botIds = Array.from(selectedBots);
    const stoppedBots = paginatedBots.filter(bot => 
      botIds.includes(bot.bot_id) && (bot.status === 'stopped' || bot.status === 'paused')
    );
    
    if (stoppedBots.length === 0) {
      toast.error('No stopped or paused bots selected');
      return;
    }
    
    try {
      const results = await Promise.allSettled(
        stoppedBots.map(bot => handleStart(bot.bot_id))
      );
      
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      if (succeeded > 0) {
        toast.success(`Started ${succeeded} bot(s)${failed > 0 ? `, ${failed} failed` : ''}`);
      }
      if (failed > 0 && succeeded === 0) {
        toast.error(`Failed to start ${failed} bot(s)`);
      }
      
      setSelectedBots(new Set());
      setShowBulkActions(false);
      refetch();
    } catch (error) {
      toast.error('Failed to start selected bots');
    }
  };
  
  const handleBulkArchive = async () => {
    const botIds = Array.from(selectedBots);
    const botsToArchive = paginatedBots.filter(bot => botIds.includes(bot.bot_id)) as TradingBot[];
    
    if (botsToArchive.length === 0) {
      toast.error('No bots selected');
      return;
    }
    
    if (!confirm(`Are you sure you want to archive ${botsToArchive.length} bot(s)?`)) {
      return;
    }
    
    try {
      const results = await Promise.allSettled(
        botsToArchive.map(bot => handleArchiveBot(bot))
      );
      
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      if (succeeded > 0) {
        toast.success(`Archived ${succeeded} bot(s)${failed > 0 ? `, ${failed} failed` : ''}`);
      }
      if (failed > 0 && succeeded === 0) {
        toast.error(`Failed to archive ${failed} bot(s)`);
      }
      
      setSelectedBots(new Set());
      setShowBulkActions(false);
      refetch();
    } catch (error) {
      toast.error('Failed to archive selected bots');
    }
  };
  
  const handleSelectAllVisible = () => {
    const allVisible = new Set(paginatedBots.map(bot => bot.bot_id));
    setSelectedBots(allVisible);
  };
  
  const handleDeselectAll = () => {
    setSelectedBots(new Set());
  };
  
  const toggleBotSelection = (botId: string) => {
    const newSelected = new Set(selectedBots);
    if (newSelected.has(botId)) {
      newSelected.delete(botId);
    } else {
      newSelected.add(botId);
    }
    setSelectedBots(newSelected);
  };
  
  // Fetch available accounts from API
  const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        setAccountsLoading(true);
        const response = await fetch(`/api/accounts`);
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
  
  // Helper function to determine bot type
  const getBotType = (bot: any): 'orcamax' | 'bonucci' | 'fibonacci' => {
    if (bot.bot_type === 'orcamax') return 'orcamax';
    if (bot.bot_type === 'bonucci') return 'bonucci';
    // If no bot_type but has fibonacci levels, it's a fibonacci bot
    if (bot.fibonacci_levels && Object.keys(bot.fibonacci_levels).length > 0) return 'fibonacci';
    return 'orcamax'; // Default fallback
  };

  // Filter bots by status, type, and date
  let filteredBots = bots;
  
  // Apply status filter
  if (statusFilter !== 'all') {
    filteredBots = filteredBots.filter(bot => bot.status === statusFilter);
  }
  
  // Apply bot type filter
  if (botTypeFilter !== 'all') {
    filteredBots = filteredBots.filter(bot => getBotType(bot) === botTypeFilter);
  }
  
  // Apply date filter
  if (dateFilterType === 'specific' && specificDate) {
    filteredBots = filteredBots.filter(bot => {
      const botDate = new Date(bot.start_time).toISOString().split('T')[0];
      return botDate === specificDate;
    });
  } else if (dateFilterType === 'range' && dateRangeStart && dateRangeEnd) {
    filteredBots = filteredBots.filter(bot => {
      const botDate = new Date(bot.start_time);
      const startDate = new Date(dateRangeStart);
      const endDate = new Date(dateRangeEnd);
      endDate.setHours(23, 59, 59, 999); // Include entire end date
      return botDate >= startDate && botDate <= endDate;
    });
  }
  
  // Sort by start time (latest first)
  const sortedBots = [...filteredBots].sort((a, b) => {
    const timeA = new Date(a.start_time).getTime();
    const timeB = new Date(b.start_time).getTime();
    return timeB - timeA; // Latest first
  });
  
  // Pagination
  const totalPages = Math.ceil(sortedBots.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedBots = sortedBots.slice(startIndex, endIndex);
  
  // All bots for stats
  const allBots = bots;

  const handleBotTypeSelect = (type: BotType) => {
    setSelectedBotType(type);
    setShowConfigForm(true);
  };

  const handleCancelConfig = () => {
    setShowConfigForm(false);
    setSelectedBotType(null);
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

      const response = await fetch(`/api/bots/create/orcamax`, {
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
        toast.success('OrcaMax bot deployed successfully!');
        setShowConfigForm(false);
        setSelectedBotType(null);
        // Refresh bots list
        setTimeout(() => refetch(), 1000);
      } else {
        throw new Error(data.error || 'Failed to deploy bot');
      }
    } catch (error) {
      console.error('Error deploying OrcaMax bot:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to deploy OrcaMax bot');
    }
  };

  const handleStatusUpdate = async (botId: string, newStatus: 'running' | 'paused') => {
    try {
      // Get auth token from localStorage
      const token = localStorage.getItem('access_token');
      
      const response = await fetch(`/api/bots/${botId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        // Small delay to ensure Redis update has propagated
        await new Promise(resolve => setTimeout(resolve, 100));
        // Refetch the bots to get updated data first
        await refetch();
        
        // Verify the status was actually updated
        const updatedBot = bots.find(bot => bot.bot_id === botId);
        if (updatedBot && updatedBot.status === newStatus) {
          toast.success(`Bot ${newStatus === 'running' ? 'started' : 'paused'} successfully`);
        } else {
          console.warn('Status update may not have been reflected:', { 
            expected: newStatus, 
            actual: updatedBot?.status,
            botId 
          });
          toast.success(`Bot ${newStatus === 'running' ? 'started' : 'paused'} successfully`);
        }
      } else {
        throw new Error(data.error || 'Failed to update bot status');
      }
    } catch (error) {
      console.error('Error updating bot status:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update bot status');
    }
  };

  const handleStart = (botId: string) => {
    const bot = bots.find(b => b.bot_id === botId);
    if (bot) {
      setConfirmationBot(bot as TradingBot);
      setConfirmationAction('start');
      setShowConfirmation(true);
    }
  };

  const handleStop = (botId: string) => {
    const bot = bots.find(b => b.bot_id === botId);
    if (bot) {
      setConfirmationBot(bot as TradingBot);
      setConfirmationAction('stop');
      setShowConfirmation(true);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmationBot || !confirmationAction) return;
    
    setIsProcessing(true);
    try {
      await handleStatusUpdate(
        confirmationBot.bot_id,
        confirmationAction === 'start' ? 'running' : 'paused'
      );
    } finally {
      setIsProcessing(false);
      setShowConfirmation(false);
      setConfirmationBot(null);
      setConfirmationAction(null);
    }
  };
  
  const getStatusIcon = (status: TradingBot['status']) => {
    switch (status) {
      case 'running':
        return <Activity className="h-4 w-4 text-green-500" />;
      case 'stopped':
        return <AlertTriangle className="h-4 w-4 text-gray-500" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: TradingBot['status']) => {
    switch (status) {
      case 'running':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'stopped':
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
      case 'error':
      case 'paused':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      default:
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  // If showing config form, render it instead of the main view
  if (showConfigForm && selectedBotType) {
    if (selectedBotType === 'orcamax') {
      return (
        <OrcaMaxConfigForm
          onSubmit={handleOrcaMaxSubmit}
          onCancel={handleCancelConfig}
          availableAccounts={availableAccounts}
        />
      );
    } else if (selectedBotType === 'bonucci') {
      return <BonucciConfigForm onCancel={handleCancelConfig} />;
    }
  }

  return (
    <div className="space-y-4">
      <BotCreationDialog
        open={showCreationDialog}
        onOpenChange={setShowCreationDialog}
        onBotTypeSelect={handleBotTypeSelect}
      />

      <ConfigLibrary
        open={showConfigLibrary}
        onOpenChange={setShowConfigLibrary}
        onRunConfig={handleRunConfigFromLibrary}
      />
      
      <BotActionConfirmationDialog
        open={showConfirmation}
        onOpenChange={setShowConfirmation}
        bot={confirmationBot}
        action={confirmationAction}
        onConfirm={handleConfirmAction}
        isLoading={isProcessing}
      />
      
      {selectedBotForDetails && (
        <BotConfigDetails
          bot={selectedBotForDetails}
          open={showBotDetails}
          onOpenChange={(open) => {
            setShowBotDetails(open);
            if (!open) setSelectedBotForDetails(null);
          }}
        />
      )}
      
      {/* Header Section */}
      <div className="flex flex-col space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-white via-blue-100 to-blue-200 bg-clip-text text-transparent">
              Trading Bot Manager
            </h2>
            <p className="text-sm text-slate-400 mt-1">Monitor, control, and manage your automated trading strategies</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button 
              size="sm" 
              onClick={() => setShowConfigLibrary(true)}
              className="gap-2 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-600 border-0 shadow-lg shadow-purple-500/20"
            >
              <BookOpen className="h-4 w-4" />
              Config Library
            </Button>
            <Button 
              size="sm" 
              onClick={() => setShowCreationDialog(true)}
              className="gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-600 border-0 shadow-lg shadow-blue-500/20"
            >
              <Plus className="h-4 w-4" />
              New Bot
            </Button>
          <Badge variant="outline" className="text-xs border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            {allBots.filter(bot => bot.status === 'running').length} Running
          </Badge>
          <Badge variant="outline" className="text-xs border-slate-600/30 bg-slate-600/10 text-slate-300">
            {allBots.filter(bot => bot.status === 'stopped').length} Stopped
          </Badge>
          <Badge variant="outline" className="text-xs border-rose-500/30 bg-rose-500/10 text-rose-400">
            {allBots.filter(bot => bot.status === 'error').length} Error
          </Badge>
          </div>
        </div>
        
        {error && (
          <p className="text-xs text-rose-400 mt-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Error: {error}
          </p>
        )}
      </div>
      
      {/* Tabs Component */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        {/* Tab Navigation */}
        <TabsList className="w-fit bg-muted/30 border">
          <TabsTrigger value="active" className="gap-2">
            <Activity className="h-4 w-4" />
            Active Bots
            <Badge variant="outline" className="ml-1 text-xs">
              {allBots.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="archived" className="gap-2">
            <ArchiveIcon className="h-4 w-4" />
            Archived
          </TabsTrigger>
          <TabsTrigger value="configs" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Configurations
          </TabsTrigger>
        </TabsList>

      {/* Active Bots Tab */}
      <TabsContent value="active" className="space-y-4">
        {/* Filter and Pagination Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-muted/30 border rounded-lg p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Filter:</span>
            <Select value={statusFilter} onValueChange={(value: any) => {
              setStatusFilter(value);
              setCurrentPage(1); // Reset to first page when filter changes
            }}>
            <SelectTrigger className="w-[130px] h-8">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="stopped">Stopped</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          
          <Separator orientation="vertical" className="h-6" />
          
          <span className="text-sm font-medium text-muted-foreground">Type:</span>
          <Select value={botTypeFilter} onValueChange={(value: any) => {
            setBotTypeFilter(value);
            setCurrentPage(1); // Reset to first page when filter changes
          }}>
            <SelectTrigger className="w-[130px] h-8">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="orcamax">OrcaMax</SelectItem>
              <SelectItem value="bonucci">Bonucci</SelectItem>
              <SelectItem value="fibonacci">Fibonacci</SelectItem>
            </SelectContent>
          </Select>
          
          <Separator orientation="vertical" className="h-6" />
          
          {/* Date Filter */}
          <Popover open={showDateFilter} onOpenChange={setShowDateFilter}>
            <PopoverTrigger asChild>
              <Button 
                variant={dateFilterType !== 'none' ? 'default' : 'outline'} 
                size="sm" 
                className="h-8 gap-2"
              >
                <Calendar className="h-4 w-4" />
                {dateFilterType === 'none' && 'Date Filter'}
                {dateFilterType === 'specific' && `Date: ${specificDate}`}
                {dateFilterType === 'range' && `${dateRangeStart} to ${dateRangeEnd}`}
                {dateFilterType !== 'none' && (
                  <X 
                    className="h-3 w-3 ml-1" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setDateFilterType('none');
                      setSpecificDate('');
                      setDateRangeStart('');
                      setDateRangeEnd('');
                      setCurrentPage(1);
                    }}
                  />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Filter by Start Date</h4>
                  <p className="text-xs text-muted-foreground">
                    Filter bots by when they were started
                  </p>
                </div>
                
                <Separator />
                
                {/* Date Filter Type Selection */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Filter Type</Label>
                  <Select value={dateFilterType} onValueChange={(value: any) => setDateFilterType(value)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Date Filter</SelectItem>
                      <SelectItem value="specific">Specific Date</SelectItem>
                      <SelectItem value="range">Date Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Specific Date Input */}
                {dateFilterType === 'specific' && (
                  <div className="space-y-2">
                    <Label htmlFor="specific-date" className="text-sm">Select Date</Label>
                    <Input
                      id="specific-date"
                      type="date"
                      value={specificDate}
                      onChange={(e) => setSpecificDate(e.target.value)}
                      className="w-full"
                    />
                  </div>
                )}
                
                {/* Date Range Inputs */}
                {dateFilterType === 'range' && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="date-start" className="text-sm">Start Date</Label>
                      <Input
                        id="date-start"
                        type="date"
                        value={dateRangeStart}
                        onChange={(e) => setDateRangeStart(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="date-end" className="text-sm">End Date</Label>
                      <Input
                        id="date-end"
                        type="date"
                        value={dateRangeEnd}
                        onChange={(e) => setDateRangeEnd(e.target.value)}
                        min={dateRangeStart}
                        className="w-full"
                      />
                    </div>
                  </div>
                )}
                
                {/* Apply Button */}
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    className="flex-1"
                    onClick={() => {
                      setCurrentPage(1);
                      setShowDateFilter(false);
                    }}
                    disabled={
                      (dateFilterType === 'specific' && !specificDate) ||
                      (dateFilterType === 'range' && (!dateRangeStart || !dateRangeEnd))
                    }
                  >
                    Apply Filter
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      setDateFilterType('none');
                      setSpecificDate('');
                      setDateRangeStart('');
                      setDateRangeEnd('');
                      setCurrentPage(1);
                      setShowDateFilter(false);
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          <Separator orientation="vertical" className="h-6" />
          
          {/* Bulk Actions Toggle */}
          <Button
            variant={showBulkActions ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setShowBulkActions(!showBulkActions);
              setSelectedBots(new Set());
            }}
            className="h-8 gap-2"
          >
            {showBulkActions ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            Bulk Actions
          </Button>
          
          <Separator orientation="vertical" className="h-6" />
          
          <span className="text-sm font-medium text-muted-foreground">Show:</span>
          <Select value={itemsPerPage.toString()} onValueChange={(value) => {
            setItemsPerPage(Number(value));
            setCurrentPage(1); // Reset to first page when items per page changes
          }}>
            <SelectTrigger className="w-[90px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(endIndex, sortedBots.length)} of {sortedBots.length}
          </span>
          </div>
        
          {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="h-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium px-2">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="h-8"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
        </div>

        {/* Bots Container */}
        <div className="relative overflow-hidden rounded-lg border border-white/5 bg-gradient-to-br from-slate-950/50 via-slate-900/50 to-slate-950/50 backdrop-blur-sm p-3 sm:p-6">
        {/* Initial Loading State - only show when we haven't received any response yet */}
        {!hasResponded && isLoading && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading bots...</span>
          </div>
        )}
        
        {/* Error State */}
        {error && allBots.length === 0 && hasResponded && (
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
        
        {/* Empty State - show when we've responded but found no bots */}
        {allBots.length === 0 && hasResponded && !error && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Bot className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground text-center">No trading bots found</p>
            <p className="text-xs text-muted-foreground/70 mt-1 text-center px-4">Your bots will appear here when you have active trading strategies</p>
          </div>
        )}
        
        {/* Filtered Empty State */}
        {allBots.length > 0 && sortedBots.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Filter className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground text-center">No bots match the current filter</p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                setStatusFilter('all');
                setBotTypeFilter('all');
                setDateFilterType('none');
                setSpecificDate('');
                setDateRangeStart('');
                setDateRangeEnd('');
              }}
              className="mt-3"
            >
              Clear All Filters
            </Button>
          </div>
        )}
        
        {/* Bulk Actions Bar */}
        {showBulkActions && paginatedBots.length > 0 && (
          <div className="flex items-center justify-between p-4 bg-primary/10 border border-primary/30 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">
                {selectedBots.size} bot(s) selected
              </span>
              {selectedBots.size < paginatedBots.length ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSelectAllVisible}
                  className="h-7 text-xs"
                >
                  Select All Visible
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDeselectAll}
                  className="h-7 text-xs"
                >
                  Deselect All
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkStart}
                disabled={selectedBots.size === 0}
                className="gap-2"
              >
                <Play className="h-3 w-3" />
                Start Selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkStop}
                disabled={selectedBots.size === 0}
                className="gap-2"
              >
                <Pause className="h-3 w-3" />
                Stop Selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkArchive}
                disabled={selectedBots.size === 0}
                className="gap-2"
              >
                <ArchiveIcon className="h-3 w-3" />
                Archive Selected
              </Button>
            </div>
          </div>
        )}
        
        {/* Bots Grid - Premium Cards */}
        {paginatedBots.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
            {paginatedBots.map((bot) => (
              <PremiumBotCard
                key={bot.bot_id}
                bot={bot as TradingBot}
                onStart={handleStart}
                onStop={handleStop}
                onShowDetails={(bot) => {
                  setSelectedBotForDetails(bot);
                  setShowBotDetails(true);
                }}
                onArchive={handleArchiveBot}
                onRestart={handleRestartBot}
                showBulkSelect={showBulkActions}
                isSelected={selectedBots.has(bot.bot_id)}
                onToggleSelect={toggleBotSelection}
              />
            ))}
          </div>
        )}
        </div>
      </TabsContent>

      {/* Archived Bots Tab */}
      <TabsContent value="archived">
        <ArchivedBotsTab />
      </TabsContent>

      {/* Configurations Tab */}
      <TabsContent value="configs" className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Bot Configurations</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Saved configurations that can be quickly deployed
            </p>
          </div>
          <Button
            onClick={() => setShowConfigLibrary(true)}
            className="gap-2"
          >
            <BookOpen className="h-4 w-4" />
            Open Library
          </Button>
        </div>
        <Card className="p-6">
          <p className="text-center text-muted-foreground">
            Click "Open Library" to view and manage your saved bot configurations
          </p>
        </Card>
      </TabsContent>
      </Tabs>
    </div>
  );
}
