'use client';

import { TradingBot } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, Square, Info, Archive, RefreshCw, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface PremiumBotCardProps {
  bot: TradingBot;
  onStart: (botId: string) => void;
  onStop: (botId: string) => void;
  onShowDetails: (bot: TradingBot) => void;
  onArchive?: (bot: TradingBot) => void;
  onRestart?: (bot: TradingBot) => void;
  showBulkSelect?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (botId: string) => void;
}

export function PremiumBotCard({ bot, onStart, onStop, onShowDetails, onArchive, onRestart, showBulkSelect, isSelected, onToggleSelect }: PremiumBotCardProps) {
  const isRunning = bot.status === 'running';
  const isStopped = bot.status === 'stopped';
  const isPaused = bot.status === 'paused';
  const isError = bot.status === 'error';

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Calculate time ago
  const getTimeAgo = (dateString: string) => {
    const now = new Date();
    const then = new Date(dateString);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  // Status configuration
  const statusConfig = {
    running: {
      label: 'RUNNING',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      glow: 'shadow-[0_0_15px_rgba(16,185,129,0.3)]'
    },
    stopped: {
      label: 'STOPPED',
      color: 'text-rose-400',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/30',
      glow: 'shadow-[0_0_15px_rgba(244,63,94,0.3)]'
    },
    paused: {
      label: 'PAUSED',
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      glow: 'shadow-[0_0_15px_rgba(251,191,36,0.3)]'
    },
    error: {
      label: 'ERROR',
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      glow: 'shadow-[0_0_15px_rgba(239,68,68,0.3)]'
    }
  };

  const status = statusConfig[bot.status] || statusConfig.stopped;
  
  // Get bot name from config
  const config = bot.config as any;
  const botName = config?.custom_name || null;

  return (
    <div className="group relative">
      {/* Bulk selection checkbox */}
      {showBulkSelect && (
        <div className="absolute top-3 left-3 z-10">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect?.(bot.bot_id)}
            className="h-4 w-4 rounded border-gray-600 text-primary focus:ring-2 focus:ring-primary cursor-pointer"
          />
        </div>
      )}
      
      {/* Card with gradient background */}
      <div className={cn(
        "relative overflow-hidden rounded-xl border border-white/5",
        "bg-gradient-to-br from-slate-900/90 via-slate-800/90 to-slate-900/90",
        "backdrop-blur-sm transition-all duration-300",
        "hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10",
        "hover:scale-[1.02]",
        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-slate-950"
      )}>
        {/* Top accent line */}
        <div className={cn(
          "absolute top-0 left-0 right-0 h-[2px]",
          isRunning ? "bg-gradient-to-r from-transparent via-emerald-500 to-transparent" :
          isStopped ? "bg-gradient-to-r from-transparent via-rose-500 to-transparent" :
          isPaused ? "bg-gradient-to-r from-transparent via-amber-500 to-transparent" :
          "bg-gradient-to-r from-transparent via-red-500 to-transparent",
          "opacity-50"
        )} />

        <div className="p-5 space-y-4">
          {/* Header Section */}
          <div className="flex items-start justify-between">
            <div className="space-y-1 flex-1 min-w-0">
              <h3 className="text-lg font-bold tracking-wide text-white/90 uppercase">
                {bot.bot_type === 'orcamax' ? 'ORCAMAX' : bot.bot_type?.toUpperCase()}
              </h3>
              {botName && (
                <p className="text-sm font-semibold text-blue-300/90 truncate">
                  {botName}
                </p>
              )}
              <p className="text-xs font-mono text-slate-400 tracking-wider">
                {bot.account_name}
              </p>
            </div>
            
            {/* Status Badge with glow */}
            <div className={cn(
              "px-3 py-1.5 rounded-md border text-xs font-semibold tracking-wider",
              status.bg,
              status.border,
              status.color,
              status.glow
            )}>
              {status.label}
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Left Column */}
            <div className="space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1">Started</p>
                <p className="text-sm text-slate-300 font-medium">{formatDate(bot.start_time)}</p>
              </div>
              
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1">Win Rate</p>
                <p className="text-sm text-slate-300 font-medium">
                  {bot.won_orders && bot.lost_orders
                    ? `${Math.round((bot.won_orders / (bot.won_orders + bot.lost_orders)) * 100)}%`
                    : '—'}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1">Open Positions</p>
                <p className="text-sm text-slate-300 font-medium">{bot.open_positions || 0}</p>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1">Last Health Check</p>
                <p className="text-sm text-slate-300 font-medium">{getTimeAgo(bot.last_health_check)}</p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1">Total P&L</p>
                <p className={cn(
                  "text-sm font-bold",
                  bot.total_pnl > 0 ? "text-emerald-400" : bot.total_pnl < 0 ? "text-rose-400" : "text-slate-400"
                )}>
                  {bot.total_pnl > 0 ? '+' : ''}{bot.total_pnl.toFixed(2)}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1">Active Orders</p>
                <p className="text-sm text-slate-300 font-medium">{bot.active_orders || 0}</p>
              </div>
            </div>
          </div>

          {/* Bottom Section */}
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            {/* Instrument Badges */}
            <div className="flex items-center gap-2">
              <Badge 
                variant="outline" 
                className="border-primary/30 bg-primary/5 text-primary font-mono text-xs px-2 py-0.5"
              >
                {bot.instrument}
              </Badge>
              <Badge 
                variant="outline" 
                className="border-slate-600/50 bg-slate-700/30 text-slate-300 font-mono text-xs px-2 py-0.5"
              >
                UID {bot.bot_id}
              </Badge>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-slate-400 hover:text-primary hover:bg-primary/10"
                onClick={() => onShowDetails(bot)}
              >
                <Info className="h-3.5 w-3.5" />
              </Button>
              
              {isRunning ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onStop(bot.bot_id)}
                  className={cn(
                    "h-8 px-3 text-xs font-semibold tracking-wide",
                    "border-rose-500/40 bg-rose-500/10 text-rose-400",
                    "hover:bg-rose-500/20 hover:border-rose-500/60",
                    "transition-all duration-200"
                  )}
                >
                  STOP
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onStart(bot.bot_id)}
                  className={cn(
                    "h-8 px-3 text-xs font-semibold tracking-wide",
                    "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
                    "hover:bg-emerald-500/20 hover:border-emerald-500/60",
                    "transition-all duration-200"
                  )}
                >
                  START
                </Button>
              )}
              
              {/* More Options Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-slate-400 hover:text-primary hover:bg-primary/10"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Bot Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  
                  {!isRunning && onRestart && (
                    <DropdownMenuItem
                      onClick={() => onRestart(bot)}
                      className="cursor-pointer"
                    >
                      <RefreshCw className="h-4 w-4 mr-2 text-blue-400" />
                      <span>Restart Bot</span>
                    </DropdownMenuItem>
                  )}
                  
                  {(isStopped || isError) && onArchive && (
                    <DropdownMenuItem
                      onClick={() => onArchive(bot)}
                      className="cursor-pointer"
                    >
                      <Archive className="h-4 w-4 mr-2 text-amber-400" />
                      <span>Archive Bot</span>
                    </DropdownMenuItem>
                  )}
                  
                  <DropdownMenuItem
                    onClick={() => {
                      const config = JSON.stringify(bot.config, null, 2);
                      navigator.clipboard.writeText(config);
                      toast.success('Configuration copied to clipboard');
                    }}
                    className="cursor-pointer"
                  >
                    <Info className="h-4 w-4 mr-2" />
                    <span>Copy Config</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Hover gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      </div>
    </div>
  );
}
