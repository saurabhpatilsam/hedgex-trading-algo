import { X, TrendingUp, AlertCircle, RefreshCw, Minus } from 'lucide-react';
import { Position } from '@/hooks/usePositions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePositions } from '@/hooks/usePositions';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useState } from 'react';

interface PositionsTabProps {
  selectedAccount: string | null;
}

export function PositionsTab({ selectedAccount }: PositionsTabProps) {
  const { positions, isLoading, error, lastUpdate, refetch } = usePositions(selectedAccount);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    positionId: string | null;
  }>({ open: false, positionId: null });
  const [flattenAllDialog, setFlattenAllDialog] = useState(false);
  const [isFlatteningAll, setIsFlatteningAll] = useState(false);
  const formatCurrency = (value: number) => {
    return value.toLocaleString('en-US', { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    });
  };

  const formatNumber = (value: number) => {
    return value.toLocaleString('en-US', { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    });
  };

  const getSideColor = (side: Position['side']) => {
    return side === 'buy' ? 'text-blue-500' : 'text-red-500';
  };

  const handleCancelPosition = async (positionId: string) => {
    if (!selectedAccount) return;
    
    try {
      const response = await fetch(`/api/positions/cancel?account=${encodeURIComponent(selectedAccount)}&positionId=${encodeURIComponent(positionId)}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Position ${positionId}`, {
          description: "Position has been cancelled successfully",
        });
        // Refresh positions to show updated status
        refetch();
      } else {
        toast.error(`Position ${positionId}`, {
          description: data.error || "Failed to cancel position",
        });
      }
    } catch (error) {
      toast.error(`Position ${positionId}`, {
        description: "An error occurred while cancelling the position",
      });
    }
  };

  const openCancelDialog = (positionId: string) => {
    setConfirmDialog({ open: true, positionId });
  };

  const closeCancelDialog = () => {
    setConfirmDialog({ open: false, positionId: null });
  };

  const confirmCancel = () => {
    if (confirmDialog.positionId) {
      handleCancelPosition(confirmDialog.positionId);
      closeCancelDialog();
    }
  };

  const handleFlattenAllPositions = async () => {
    if (!selectedAccount) return;
    
    setIsFlatteningAll(true);
    try {
      if (positions.length === 0) {
        toast.info("No positions to flatten");
        return;
      }

      // Cancel all positions
      const cancelPromises = positions.map(position => 
        fetch(`/api/positions/cancel?account=${encodeURIComponent(selectedAccount)}&positionId=${encodeURIComponent(position.id)}`, {
          method: 'DELETE',
        }).then(response => response.json())
      );

      const results = await Promise.allSettled(cancelPromises);
      
      // Count successes and failures
      const successful = results.filter(result => 
        result.status === 'fulfilled' && result.value.success
      ).length;
      
      const failed = results.length - successful;

      if (successful > 0) {
        toast.success(`Flattened ${successful} positions`, {
          description: failed > 0 ? `${failed} positions failed to flatten` : "All positions flattened successfully",
        });
      } else {
        toast.error("Failed to flatten positions", {
          description: "No positions were flattened successfully",
        });
      }

      // Refresh positions to show updated status
      refetch();
    } catch (error) {
      toast.error("Error flattening positions", {
        description: "An error occurred while flattening positions",
      });
    } finally {
      setIsFlatteningAll(false);
      setFlattenAllDialog(false);
    }
  };

  // Show loading state only on initial load when no account is selected
  if (isLoading && !selectedAccount) {
    return (
      <div className="space-y-2">
        <div className="border rounded-lg overflow-hidden shadow-sm">
          <div className="px-6 py-12 text-center text-muted-foreground">
            <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-50 animate-spin" />
            <p>Loading positions...</p>
            <p className="text-sm">Fetching positions from Tradovate API</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="space-y-2">
        <div className="border rounded-lg overflow-hidden shadow-sm">
          <div className="px-6 py-12 text-center text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <p className="text-red-600 font-medium">Error loading positions</p>
            <p className="text-sm text-red-500">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Status bar */}
      {selectedAccount && (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
            <span>Positions for {selectedAccount}</span>
            {lastUpdate && (
              <span>Last updated: {new Date(lastUpdate).toLocaleTimeString()}</span>
            )}
          </div>
          
          {/* Flatten All Positions Button */}
          {positions.length > 0 && (
            <Button
              onClick={() => setFlattenAllDialog(true)}
              variant="destructive"
              size="sm"
              className="h-8 px-3 text-xs"
              disabled={isFlatteningAll}
            >
              <Minus className="h-3 w-3 mr-1" />
              {isFlatteningAll ? 'Flattening...' : `Flatten All (${positions.length})`}
            </Button>
          )}
        </div>
      )}

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={closeCancelDialog}
        title="Cancel Position"
        description={`Are you sure you want to cancel position with ID: ${confirmDialog.positionId}?`}
        onConfirm={confirmCancel}
        confirmText="Cancel Position"
        cancelText="Keep Position"
      />

      <ConfirmDialog
        open={flattenAllDialog}
        onOpenChange={setFlattenAllDialog}
        title="Flatten All Positions"
        description={`Are you sure you want to flatten all ${positions.length} positions? This will close all open positions and cannot be undone.`}
        onConfirm={handleFlattenAllPositions}
        confirmText="Flatten All Positions"
        cancelText="Keep Positions"
      />

      <div className="border rounded-lg overflow-hidden shadow-sm">
        <table className="w-full">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Symbol</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Side</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Qty</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Avg Price</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Unrealized P&L</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Position ID</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {positions.length > 0 ? (
              positions.map((position) => (
                <tr key={position.id} className="hover:bg-muted/30 transition-colors">
                  {/* Symbol */}
                  <td className="px-2 py-2 text-xs">
                    {position.instrument}
                  </td>

                  {/* Side */}
                  <td className={`px-2 py-2 text-xs font-medium ${getSideColor(position.side)}`}>
                    {position.side === 'buy' ? 'Buy' : 'Sell'}
                  </td>

                  {/* Quantity */}
                  <td className="px-2 py-2 text-xs">{position.qty}</td>

                  {/* Avg Price */}
                  <td className="px-2 py-2 text-xs">{formatNumber(position.avgPrice)}</td>

                  {/* Unrealized P&L */}
                  <td className={`px-2 py-2 text-xs font-medium ${position.unrealizedPl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {position.unrealizedPl >= 0 ? '+' : ''}{formatCurrency(position.unrealizedPl)}
                  </td>

                  {/* Position ID */}
                  <td className="px-2 py-2 text-xs font-mono">{position.id}</td>

                  {/* Actions */}
                  <td className="px-2 py-2">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-5 w-5 p-0"
                      onClick={() => openCancelDialog(position.id)}
                    >
                      <X className="h-2.5 w-2.5" />
                    </Button>
                  </td>
                </tr>
              ))
            ) : selectedAccount ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No open positions</p>
                  <p className="text-sm">Your positions will appear here when you have active trades</p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

      </div>
    </div>
  );
}
