import { X, Clock, AlertCircle, RefreshCw, Trash2 } from 'lucide-react';
import { Order } from '@/hooks/useOrders';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOrders } from '@/hooks/useOrders';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useState } from 'react';

interface OrdersTabProps {
  selectedAccount: string | null;
}

export function OrdersTab({ selectedAccount }: OrdersTabProps) {
  const { orders, isLoading, error, lastUpdate, refetch } = useOrders(selectedAccount);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    orderId: string | null;
  }>({ open: false, orderId: null });
  const [cancelAllDialog, setCancelAllDialog] = useState(false);
  const [isCancellingAll, setIsCancellingAll] = useState(false);
  const formatNumber = (value: number) => {
    return value.toLocaleString('en-US', { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    });
  };

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'working':
        return 'text-blue-600';
      case 'filled':
        return 'text-green-600';
      case 'cancelled':
        return 'text-gray-500';
      case 'rejected':
        return 'text-red-600';
      default:
        return 'text-muted-foreground';
    }
  };

  const getSideColor = (side: Order['side']) => {
    return side === 'Buy' ? 'text-blue-500' : 'text-red-500';
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!selectedAccount) return;
    
    try {
      const response = await fetch(`/api/orders/cancel?account=${encodeURIComponent(selectedAccount)}&orderId=${encodeURIComponent(orderId)}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Order ${orderId}`, {
          description: "Order has been cancelled successfully",
        });
        // Refresh orders to show updated status
        refetch();
      } else {
        toast.error(`Order ${orderId}`, {
          description: data.error || "Failed to cancel order",
        });
      }
    } catch (error) {
      toast.error(`Order ${orderId}`, {
        description: "An error occurred while cancelling the order",
      });
    }
  };

  const openCancelDialog = (orderId: string) => {
    setConfirmDialog({ open: true, orderId });
  };

  const closeCancelDialog = () => {
    setConfirmDialog({ open: false, orderId: null });
  };

  const confirmCancel = () => {
    if (confirmDialog.orderId) {
      handleCancelOrder(confirmDialog.orderId);
      closeCancelDialog();
    }
  };

  const handleCancelAllOrders = async () => {
    if (!selectedAccount) return;
    
    setIsCancellingAll(true);
    try {
      // Get all working orders
      const workingOrders = orders.filter(order => order.status === 'working');
      
      if (workingOrders.length === 0) {
        toast.info("No working orders to cancel");
        return;
      }

      // Cancel all working orders
      const cancelPromises = workingOrders.map(order => 
        fetch(`/api/orders/cancel?account=${encodeURIComponent(selectedAccount)}&orderId=${encodeURIComponent(order.id)}`, {
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
        toast.success(`Cancelled ${successful} orders`, {
          description: failed > 0 ? `${failed} orders failed to cancel` : "All working orders cancelled successfully",
        });
      } else {
        toast.error("Failed to cancel orders", {
          description: "No orders were cancelled successfully",
        });
      }

      // Refresh orders to show updated status
      refetch();
    } catch (error) {
      toast.error("Error cancelling orders", {
        description: "An error occurred while cancelling orders",
      });
    } finally {
      setIsCancellingAll(false);
      setCancelAllDialog(false);
    }
  };

  // Show loading state only on initial load when no account is selected
  if (isLoading && !selectedAccount) {
    return (
      <div className="space-y-2">
        <div className="border rounded-lg overflow-hidden shadow-sm">
          <div className="px-6 py-12 text-center text-muted-foreground">
            <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-50 animate-spin" />
            <p>Loading orders...</p>
            <p className="text-sm">Fetching orders from Tradovate API</p>
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
            <p className="text-red-600 font-medium">Error loading orders</p>
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
            <span>Orders for {selectedAccount}</span>
            {lastUpdate && (
              <span>Last updated: {new Date(lastUpdate).toLocaleTimeString()}</span>
            )}
          </div>
          
          {/* Cancel All Orders Button */}
          {orders.filter(order => order.status === 'working').length > 0 && (
            <Button
              onClick={() => setCancelAllDialog(true)}
              variant="destructive"
              size="sm"
              className="h-8 px-3 text-xs"
              disabled={isCancellingAll}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              {isCancellingAll ? 'Cancelling...' : `Cancel All (${orders.filter(order => order.status === 'working').length})`}
            </Button>
          )}
        </div>
      )}

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={closeCancelDialog}
        title="Cancel Order"
        description={`Are you sure you want to cancel order with ID: ${confirmDialog.orderId}?`}
        onConfirm={confirmCancel}
        confirmText="Cancel Order"
        cancelText="Keep Order"
      />

      <ConfirmDialog
        open={cancelAllDialog}
        onOpenChange={setCancelAllDialog}
        title="Cancel All Working Orders"
        description={`Are you sure you want to cancel all ${orders.filter(order => order.status === 'working').length} working orders? This action cannot be undone.`}
        onConfirm={handleCancelAllOrders}
        confirmText="Cancel All Orders"
        cancelText="Keep Orders"
      />

      <div className="border rounded-lg overflow-hidden shadow-sm">
        <table className="w-full">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Symbol</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Side</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Type</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Qty</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Limit</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Stop</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Fill</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Take Profit</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Stop Loss</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Order ID</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Time</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders.length > 0 ? (
              orders.map((order) => (
                <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                  {/* Symbol */}
                  <td className="px-2 py-2 text-xs">
                    {order.symbol}
                  </td>

                  {/* Side */}
                  <td className={`px-2 py-2 text-xs font-medium ${getSideColor(order.side)}`}>
                    {order.side}
                  </td>

                  {/* Type */}
                  <td className="px-2 py-2 text-xs capitalize">{order.type}</td>

                  {/* Quantity */}
                  <td className="px-2 py-2 text-xs">{order.qty}</td>

                  {/* Limit Price */}
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {order.limit ? formatNumber(order.limit) : '-'}
                  </td>

                  {/* Stop Price */}
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {order.stop ? formatNumber(order.stop) : '-'}
                  </td>

                  {/* Fill Price */}
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {order.fill ? formatNumber(order.fill) : '-'}
                  </td>

                  {/* Take Profit */}
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {order.takeProfit ? formatNumber(order.takeProfit) : '-'}
                  </td>

                  {/* Stop Loss */}
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {order.stopLoss ? formatNumber(order.stopLoss) : '-'}
                  </td>

                  {/* Status */}
                  <td className={`px-2 py-2 text-xs font-medium ${getStatusColor(order.status)}`}>
                    {order.status}
                  </td>

                  {/* Order ID */}
                  <td className="px-2 py-2 text-xs font-mono">{order.orderId}</td>

                  {/* Time */}
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {formatDateTime(order.time)}
                  </td>

                                  {/* Actions */}
                <td className="px-2 py-2">
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-5 w-5 p-0"
                    onClick={() => openCancelDialog(order.id)}
                  >
                    <X className="h-2.5 w-2.5" />
                  </Button>
                </td>
                </tr>
              ))
            ) : selectedAccount ? (
              <tr>
                <td colSpan={13} className="px-6 py-12 text-center text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No orders</p>
                  <p className="text-sm">Your orders will appear here when you place trades</p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
