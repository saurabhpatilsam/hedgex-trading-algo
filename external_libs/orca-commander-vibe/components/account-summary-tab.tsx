import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AccountSelector } from '@/components/account-selector';
import { PositionsTab } from '@/components/positions-tab';
import { OrdersTab } from '@/components/orders-tab';
import { AccountSummary } from '@/components/account-summary';
import { Account, Position, Order } from '@/lib/types';

interface AccountSummaryTabProps {
  selectedAccount: Account | null;
  accounts: Account[];
  onAccountChange: (account: Account) => void;
  positions: Position[];
  orders: Order[];
}

export function AccountSummaryTab({ 
  selectedAccount, 
  accounts, 
  onAccountChange, 
  positions, 
  orders 
}: AccountSummaryTabProps) {
  if (!selectedAccount) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <p className="text-muted-foreground">No account selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Description and Account Selection */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold">Account Summary</h2>
          <p className="text-sm text-muted-foreground">
            View your trading positions, active orders, and account performance. Select an account to see detailed information.
          </p>
        </div>
        
        <div className="bg-gradient-to-r from-slate-50 to-gray-50 border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Selected Account</h3>
              <p className="text-xs text-muted-foreground">Choose an account to view positions and orders</p>
            </div>
            <AccountSelector 
              accounts={accounts}
              selectedAccount={selectedAccount}
              onAccountChange={onAccountChange}
            />
          </div>
          
          {/* Account Summary with Financial Metrics */}
          <div className="border-t pt-4">
            <AccountSummary account={selectedAccount} />
          </div>
        </div>
      </div>

      {/* Nested Tabs for Positions and Orders */}
      <div className="bg-white border rounded-lg shadow-sm">
        <Tabs defaultValue="positions">
          <div className="border-b bg-slate-50/50 px-6 py-4">
            <TabsList className="inline-flex h-9 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
              <TabsTrigger value="positions" className="px-4 py-1.5 text-sm font-medium">
                Positions
              </TabsTrigger>
              <TabsTrigger value="orders" className="px-4 py-1.5 text-sm font-medium">
                Orders
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-6">
            <TabsContent value="positions" className="mt-0">
              <PositionsTab selectedAccount={selectedAccount.name} />
            </TabsContent>

            <TabsContent value="orders" className="mt-0">
              <OrdersTab selectedAccount={selectedAccount.name} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
