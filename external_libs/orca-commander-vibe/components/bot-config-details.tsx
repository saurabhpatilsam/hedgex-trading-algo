'use client';

import { TradingBot, OrcaMaxConfig, BonucciConfig } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface BotConfigDetailsProps {
  bot: TradingBot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BotConfigDetails({ bot, open, onOpenChange }: BotConfigDetailsProps) {
  const renderOrcaMaxConfig = (config: OrcaMaxConfig | any) => (
    <div className="grid grid-cols-2 gap-4 text-sm">
      {config.contract && (
        <div>
          <p className="text-muted-foreground">Contract</p>
          <p className="font-medium">{config.contract}</p>
        </div>
      )}
      {config.trading_mode && (
        <div>
          <p className="text-muted-foreground">Trading Mode</p>
          <p className="font-medium">{config.trading_mode}</p>
        </div>
      )}
      {config.trading_side && (
        <div>
          <p className="text-muted-foreground">Trading Side</p>
          <Badge variant="outline">{config.trading_side}</Badge>
        </div>
      )}
      {config.point_position && (
        <div>
          <p className="text-muted-foreground">Point Position</p>
          <Badge variant="outline">{config.point_position.toUpperCase()}</Badge>
        </div>
      )}
      {config.point_strategy_key && (
        <div>
          <p className="text-muted-foreground">Point Strategy</p>
          <p className="font-mono text-xs">{config.point_strategy_key}</p>
        </div>
      )}
      {config.exit_strategy_key && (
        <div>
          <p className="text-muted-foreground">Exit Strategy</p>
          <p className="font-mono text-xs">{config.exit_strategy_key}</p>
        </div>
      )}
      {config.quantity && (
        <div>
          <p className="text-muted-foreground">Quantity</p>
          <p className="font-medium">{config.quantity}</p>
        </div>
      )}
      {config.environment && (
        <div>
          <p className="text-muted-foreground">Environment</p>
          <Badge variant="secondary">{config.environment}</Badge>
        </div>
      )}
      {(config.dateFrom || config.date_from) && (config.dateTo || config.date_to) && (
        <div className="col-span-2">
          <p className="text-muted-foreground">Date Range</p>
          <p className="text-xs">
            {new Date(config.dateFrom || config.date_from).toLocaleString()} → {new Date(config.dateTo || config.date_to).toLocaleString()}
          </p>
        </div>
      )}
      {config.accounts_ids && (
        <div className="col-span-2">
          <p className="text-muted-foreground">Account IDs</p>
          <p className="text-xs font-mono">{config.accounts_ids}</p>
        </div>
      )}
      {config.notes && (
        <div className="col-span-2">
          <p className="text-muted-foreground">Notes</p>
          <p className="text-xs">{config.notes}</p>
        </div>
      )}
    </div>
  );

  const renderBonucciConfig = (config: BonucciConfig) => (
    <div className="text-sm">
      <p className="text-muted-foreground">Configuration details coming soon</p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {bot.bot_type === 'orcamax' ? 'OrcaMax' : 'Bonucci'} Configuration
            <Badge variant="outline">{bot.bot_id.slice(0, 8)}</Badge>
          </DialogTitle>
          <DialogDescription>
            Bot configuration and parameters for {bot.account_name}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {bot.config && bot.bot_type === 'orcamax' && renderOrcaMaxConfig(bot.config as OrcaMaxConfig)}
          {bot.config && bot.bot_type === 'bonucci' && renderBonucciConfig(bot.config as BonucciConfig)}
          {!bot.config && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No configuration details available for this bot
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
