import { Info, RefreshCw, AlertCircle } from 'lucide-react';
import { Account } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { useAccountState } from '@/hooks/useAccountState';
import { Button } from '@/components/ui/button';

interface AccountSummaryProps {
  account: Account;
}

export function AccountSummary({ account }: AccountSummaryProps) {
  const { accountState, isLoading, error, lastUpdate, refetch } = useAccountState(account.name);

  const formatCurrency = (value: number) => {
    return value.toLocaleString('en-US', { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    });
  };

  const getPLColor = (value: number) => {
    return value >= 0 ? 'text-green-600' : 'text-red-600';
  };

  if (isLoading) {
    return (
      <div className="flex items-center space-x-4 text-xs">
        <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Loading account state...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center space-x-4 text-xs">
        <AlertCircle className="h-3 w-3 text-red-500" />
        <span className="text-red-600">Error loading account state</span>
      </div>
    );
  }

  if (!accountState) {
    return (
      <div className="flex items-center space-x-4 text-xs">
        <span className="text-muted-foreground">No account state available</span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-4 text-xs">
        <div className="flex items-center space-x-1">
          <span className="text-muted-foreground">Total P/L:</span>
          <span className={`font-medium ${getPLColor(accountState.totalPL)}`}>
            {accountState.totalPL >= 0 ? '+' : ''}{formatCurrency(accountState.totalPL)}
          </span>
        </div>
        
        <div className="flex items-center space-x-1">
          <span className="text-muted-foreground">Open P/L:</span>
          <span className={`font-medium ${getPLColor(accountState.openPL)}`}>
            {accountState.openPL >= 0 ? '+' : ''}{formatCurrency(accountState.openPL)}
          </span>
        </div>
        
        <div className="flex items-center space-x-1">
          <span className="text-muted-foreground">Net Liq:</span>
          <span className="font-medium">{formatCurrency(accountState.netLiq)}</span>
        </div>
        
        <div className="flex items-center space-x-1">
          <span className="text-muted-foreground">Total Margin Used:</span>
          <span className="font-medium">{formatCurrency(accountState.totalMarginUsed)}</span>
        </div>
        
        <div className="flex items-center space-x-1">
          <span className="text-muted-foreground">Available Margin:</span>
          <span className="font-medium">{formatCurrency(accountState.availableMargin)}</span>
        </div>
    </div>
  );
}
