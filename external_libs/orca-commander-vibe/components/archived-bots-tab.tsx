'use client';

import { useState, useEffect } from 'react';
import {
  Archive,
  RefreshCw,
  Play,
  Trash2,
  Search,
  Filter,
  Calendar,
  Clock,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
  Download,
  Upload,
  Settings,
  Eye,
  Copy,
  Database,
  FolderOpen,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BotState } from '@/hooks/useBots';
import { formatDistanceToNow } from 'date-fns';

interface ArchivedBot extends BotState {
  archived_at?: string;
  archived_by?: string;
  archive_reason?: string;
  final_pnl?: number;
  total_runtime?: number;
}

interface RestartConfigDialogProps {
  bot: ArchivedBot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestart: (bot: ArchivedBot, modified?: boolean) => void;
}

function RestartConfigDialog({ bot, open, onOpenChange, onRestart }: RestartConfigDialogProps) {
  const [modifyConfig, setModifyConfig] = useState(false);
  const [quantity, setQuantity] = useState(bot.config?.quantity || 1);
  const [account, setAccount] = useState(bot.account_name);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] border-primary/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-blue-500" />
            Restart Bot Configuration
          </DialogTitle>
          <DialogDescription>
            Restart this bot with the same or modified configuration
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Original Configuration Display */}
          <div className="rounded-lg border border-white/10 bg-slate-900/50 p-4">
            <h4 className="text-sm font-semibold mb-3">Original Configuration</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bot ID:</span>
                <span className="font-mono">{bot.bot_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type:</span>
                <Badge variant="secondary">{bot.bot_type?.toUpperCase()}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Instrument:</span>
                <span>{bot.instrument}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Final P&L:</span>
                <span className={cn(
                  "font-semibold",
                  (bot.final_pnl || bot.total_pnl) >= 0 ? "text-green-500" : "text-red-500"
                )}>
                  ${(bot.final_pnl || bot.total_pnl).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Modification Option */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="modify">Modify configuration before restart?</Label>
              <Button
                variant={modifyConfig ? "default" : "outline"}
                size="sm"
                onClick={() => setModifyConfig(!modifyConfig)}
              >
                {modifyConfig ? 'Yes, Modify' : 'Use Original'}
              </Button>
            </div>

            {modifyConfig && (
              <div className="space-y-3 p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value))}
                    min={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account">Account</Label>
                  <Select value={account} onValueChange={setAccount}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="APEX_136189">APEX_136189</SelectItem>
                      <SelectItem value="APEX_265995">APEX_265995</SelectItem>
                      <SelectItem value="APEX_266668">APEX_266668</SelectItem>
                      <SelectItem value="APEX_272045">APEX_272045</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Performance History */}
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-amber-400">Historical Performance</p>
                <p className="text-muted-foreground text-xs mt-1">
                  This bot had {bot.closed_positions} closed positions with a 
                  {bot.won_orders && bot.lost_orders ? 
                    ` ${Math.round((bot.won_orders / (bot.won_orders + bot.lost_orders)) * 100)}% win rate` : 
                    ' 0% win rate'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-600"
            onClick={() => {
              onRestart(bot, modifyConfig);
              onOpenChange(false);
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Restart Bot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ArchivedBotsTab() {
  const [archivedBots, setArchivedBots] = useState<ArchivedBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterReason, setFilterReason] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('recent');
  const [selectedBot, setSelectedBot] = useState<ArchivedBot | null>(null);
  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [selectedBots, setSelectedBots] = useState<Set<string>>(new Set());


  // Fetch archived bots
  const fetchArchivedBots = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      
      console.log('[fetchArchivedBots] Fetching from /api/bots/archived');
      
      const response = await fetch(`/api/bots/archived`, {
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });
      
      console.log('[fetchArchivedBots] Response:', { 
        status: response.status, 
        ok: response.ok 
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[fetchArchivedBots] Backend data:', data);
        setArchivedBots(data.bots || []);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[fetchArchivedBots] Backend request failed:', errorData);
        setArchivedBots([]);
        toast.error('Failed to load archived bots');
      }
    } catch (error) {
      console.error('[fetchArchivedBots] Error fetching archived bots:', error);
      setArchivedBots([]);
      toast.error('Failed to connect to backend');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArchivedBots();
  }, []);

  // Filter and sort bots
  const filteredBots = archivedBots
    .filter(bot => {
      if (searchQuery && !bot.bot_id.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (filterReason !== 'all' && bot.archive_reason !== filterReason) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return new Date(b.archived_at || b.last_health_check).getTime() - 
                 new Date(a.archived_at || a.last_health_check).getTime();
        case 'oldest':
          return new Date(a.archived_at || a.last_health_check).getTime() - 
                 new Date(b.archived_at || b.last_health_check).getTime();
        case 'profit':
          return (b.final_pnl || b.total_pnl) - (a.final_pnl || a.total_pnl);
        case 'loss':
          return (a.final_pnl || a.total_pnl) - (b.final_pnl || b.total_pnl);
        default:
          return 0;
      }
    });

  const handleUnarchive = async (botId: string) => {
    try {
      const response = await fetch(`/api/bots/${botId}/unarchive`, {
        method: 'POST',
      });
      
      if (response.ok) {
        toast.success('Bot unarchived successfully');
        setArchivedBots(prev => prev.filter(bot => bot.bot_id !== botId));
      } else {
        throw new Error('Failed to unarchive bot');
      }
    } catch (error) {
      toast.error('Failed to unarchive bot');
    }
  };

  const handleRestart = async (bot: ArchivedBot, modified: boolean = false) => {
    try {
      const response = await fetch('/api/bots/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_id: bot.bot_id,
          config: modified ? { ...bot.config, modified: true } : bot.config,
          bot_type: bot.bot_type,
        }),
      });
      
      if (response.ok) {
        toast.success('Bot restarted successfully');
        setArchivedBots(prev => prev.filter(b => b.bot_id !== bot.bot_id));
      } else {
        throw new Error('Failed to restart bot');
      }
    } catch (error) {
      toast.error('Failed to restart bot');
    }
  };

  const handleDelete = async (botId: string) => {
    if (confirm('Are you sure you want to permanently delete this bot configuration? This action cannot be undone.')) {
      try {
        const token = localStorage.getItem('access_token');
        const url = `/api/bots/${botId}?permanent=true`;
        
        console.log('Deleting bot:', { botId, url, method: 'DELETE' });
        
        const response = await fetch(url, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
          },
        });
        
        console.log('Delete response:', { 
          status: response.status, 
          statusText: response.statusText,
          ok: response.ok 
        });
        
        if (response.ok) {
          toast.success('Bot deleted permanently');
          fetchArchivedBots(); // Refetch to ensure consistency
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Delete failed:', errorData);
          throw new Error(errorData.error || `Failed to delete bot (${response.status})`);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to delete bot');
        console.error('Delete error:', error);
      }
    }
  };

  const handleBulkUnarchive = async () => {
    const botIds = Array.from(selectedBots);
    try {
      await Promise.all(botIds.map(botId => handleUnarchive(botId)));
      setSelectedBots(new Set());
      setShowBulkActions(false);
    } catch (error) {
      toast.error('Failed to unarchive some bots');
    }
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(filteredBots, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `archived-bots-${new Date().toISOString()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    toast.success('Archived bots exported successfully');
  };

  const getArchiveReasonBadge = (reason?: string) => {
    const reasonConfig = {
      'stopped': { color: 'bg-gray-500/10 text-gray-500 border-gray-500/20', icon: <X className="h-3 w-3" /> },
      'error': { color: 'bg-red-500/10 text-red-500 border-red-500/20', icon: <AlertTriangle className="h-3 w-3" /> },
      'manual': { color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: <Archive className="h-3 w-3" /> },
      'performance': { color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: <TrendingDown className="h-3 w-3" /> },
    };
    
    const config = reasonConfig[reason as keyof typeof reasonConfig] || reasonConfig.manual;
    
    return (
      <Badge variant="outline" className={cn("text-xs gap-1", config.color)}>
        {config.icon}
        {reason || 'Manual'}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
            Archived Bots
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Manage and restore your archived trading bots
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          {showBulkActions && (
            <Button
              size="sm"
              onClick={handleBulkUnarchive}
              className="gap-2 bg-gradient-to-r from-blue-600 to-blue-500"
            >
              <Upload className="h-4 w-4" />
              Unarchive Selected ({selectedBots.size})
            </Button>
          )}
          <Badge variant="outline" className="text-xs border-slate-600/30 bg-slate-600/10">
            {archivedBots.length} Archived
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-lg bg-muted/30 border">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search archived bots..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={filterReason} onValueChange={setFilterReason}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Archive Reason" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reasons</SelectItem>
            <SelectItem value="stopped">Stopped</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="performance">Performance</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Sort By" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most Recent</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="profit">Highest Profit</SelectItem>
            <SelectItem value="loss">Highest Loss</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={showBulkActions ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setShowBulkActions(!showBulkActions);
            setSelectedBots(new Set());
          }}
        >
          <Settings className="h-4 w-4 mr-2" />
          Bulk Actions
        </Button>
      </div>

      {/* Archived Bots Grid */}
      <div className="relative overflow-hidden rounded-lg border border-white/5 bg-gradient-to-br from-slate-950/50 via-slate-900/50 to-slate-950/50 backdrop-blur-sm p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading archived bots...</span>
          </div>
        ) : filteredBots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No archived bots found</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Archived bots will appear here when you archive them
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredBots.map((bot) => (
              <Card
                key={bot.bot_id}
                className={cn(
                  "group relative overflow-hidden transition-all duration-300",
                  "hover:scale-[1.01] hover:shadow-lg hover:shadow-primary/5",
                  "border-white/5 bg-gradient-to-br from-slate-900/80 via-slate-800/80 to-slate-900/80",
                  showBulkActions && selectedBots.has(bot.bot_id) && "ring-2 ring-blue-500"
                )}
              >
                {showBulkActions && (
                  <div className="absolute top-3 left-3 z-10">
                    <input
                      type="checkbox"
                      checked={selectedBots.has(bot.bot_id)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedBots);
                        if (e.target.checked) {
                          newSelected.add(bot.bot_id);
                        } else {
                          newSelected.delete(bot.bot_id);
                        }
                        setSelectedBots(newSelected);
                      }}
                      className="h-4 w-4"
                    />
                  </div>
                )}

                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{bot.bot_id}</CardTitle>
                      <CardDescription className="mt-1">
                        {bot.bot_type?.toUpperCase()} • {bot.instrument}
                      </CardDescription>
                    </div>
                    {getArchiveReasonBadge(bot.archive_reason)}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Performance Metrics */}
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-black/20 border border-white/5">
                    <div>
                      <p className="text-xs text-muted-foreground">Final P&L</p>
                      <p className={cn(
                        "text-sm font-semibold",
                        (bot.final_pnl || bot.total_pnl) >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        ${(bot.final_pnl || bot.total_pnl).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Trades</p>
                      <p className="text-sm font-semibold">{bot.closed_positions}</p>
                    </div>
                  </div>

                  {/* Archive Info */}
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      Archived {bot.archived_at ? formatDistanceToNow(new Date(bot.archived_at), { addSuffix: true }) : 'recently'}
                    </div>
                    {bot.archived_by && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        By {bot.archived_by}
                      </div>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="pt-3 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setSelectedBot(bot);
                      setShowRestartDialog(true);
                    }}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Restart
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleUnarchive(bot.bot_id)}>
                        <Upload className="h-4 w-4 mr-2" />
                        Unarchive
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate Config
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => handleDelete(bot.bot_id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Permanently
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Restart Dialog */}
      {selectedBot && (
        <RestartConfigDialog
          bot={selectedBot}
          open={showRestartDialog}
          onOpenChange={setShowRestartDialog}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
}
