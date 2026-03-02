'use client';

import { TradingBot } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Play, Square, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BotActionConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bot: TradingBot | null;
  action: 'start' | 'stop' | null;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function BotActionConfirmationDialog({
  open,
  onOpenChange,
  bot,
  action,
  onConfirm,
  isLoading = false,
}: BotActionConfirmationDialogProps) {
  if (!bot || !action) return null;

  // Access config as any since backend returns additional fields
  const config = bot.config as any;
  const botName = config?.custom_name || `Bot ${bot.bot_id}`;
  const isStart = action === 'start';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] border-primary/20">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            {isStart ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/30">
                <Play className="h-5 w-5 text-emerald-400" />
              </div>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10 border border-rose-500/30">
                <Square className="h-5 w-5 text-rose-400" />
              </div>
            )}
            <div>
              <DialogTitle className="text-xl">
                {isStart ? 'Start Trading Bot?' : 'Stop Trading Bot?'}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {isStart
                  ? 'Confirm to start trading with this configuration'
                  : 'This will stop all active trading for this bot'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Bot Details */}
        <div className="space-y-4 py-4">
          {/* Bot Name */}
          <div className="rounded-lg border border-primary/20 bg-card/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground/90">Bot Details</h3>
              <Badge variant="outline" className="text-xs font-mono">
                UID {bot.bot_id}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Name:</span>
                <span className="text-sm font-semibold text-foreground">{botName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Type:</span>
                <Badge variant="secondary" className="text-xs">
                  {bot.bot_type?.toUpperCase()}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Account:</span>
                <span className="text-sm font-mono text-foreground">{bot.account_name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Instrument:</span>
                <Badge variant="outline" className="text-xs border-primary/30 bg-primary/5 text-primary">
                  {bot.instrument}
                </Badge>
              </div>
            </div>
          </div>

          {/* Configuration Summary */}
          {config && (
            <div className="rounded-lg border border-primary/20 bg-card/50 p-4">
              <h3 className="text-sm font-semibold text-foreground/90 mb-3">Configuration</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {config.quantity && (
                  <div>
                    <span className="text-muted-foreground">Quantity:</span>
                    <span className="ml-2 font-semibold text-foreground">{config.quantity}</span>
                  </div>
                )}
                {config.environment && (
                  <div>
                    <span className="text-muted-foreground">Environment:</span>
                    <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">
                      {config.environment}
                    </Badge>
                  </div>
                )}
                {config.point_strategy_key && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Point Strategy:</span>
                    <span className="ml-2 font-mono text-foreground">{config.point_strategy_key}</span>
                  </div>
                )}
                {config.exit_strategy_key && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Exit Strategy:</span>
                    <span className="ml-2 font-mono text-foreground">{config.exit_strategy_key}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Warning/Info Message */}
          <div
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3',
              isStart
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-amber-500/30 bg-amber-500/5'
            )}
          >
            {isStart ? (
              <CheckCircle className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
            )}
            <div className="flex-1 text-sm">
              <p className={cn('font-medium', isStart ? 'text-emerald-400' : 'text-amber-400')}>
                {isStart ? 'Ready to Start' : 'Confirm Stop'}
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                {isStart
                  ? 'The bot will start trading automatically with the configuration shown above.'
                  : 'All open positions and pending orders will remain, but no new trades will be executed.'}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="flex-1 sm:flex-initial"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            disabled={isLoading}
            className={cn(
              'flex-1 sm:flex-initial',
              isStart
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-600'
                : 'bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-600'
            )}
          >
            {isLoading ? (
              <>
                <span className="animate-pulse">Processing...</span>
              </>
            ) : (
              <>
                {isStart ? (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Start Bot
                  </>
                ) : (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    Stop Bot
                  </>
                )}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
