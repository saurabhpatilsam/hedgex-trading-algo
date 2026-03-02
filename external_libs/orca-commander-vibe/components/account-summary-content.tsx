'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TradingBotsTab } from '@/components/trading-bots-tab';
import { AccountSummaryTab } from '@/components/account-summary-tab';
import { PriceCards } from '@/components/price-cards';
import { dummyAccounts, dummyPositions, dummyOrders } from '@/lib/data';
import { Account } from '@/lib/types';
import { useRedisStatus } from '@/hooks/useRedisStatus';
import { useKindePermissions } from '@/hooks/useKindePermissions';

export function AccountSummaryContent() {
  const { isConnected, isLoading, redisHost } = useRedisStatus();
  const { userPermissions, filterAccountsByPermissions, isAuthenticated, isLoading: authLoading } = useKindePermissions();
  
  // Filter accounts based on user permissions
  const availableAccounts = filterAccountsByPermissions(dummyAccounts);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  // Set initial selected account when accounts are filtered
  useEffect(() => {
    if (availableAccounts.length > 0 && !selectedAccount) {
      setSelectedAccount(availableAccounts[0]);
    } else if (availableAccounts.length === 0) {
      setSelectedAccount(null);
    }
  }, [availableAccounts, selectedAccount]);

  return (
    <div className="space-y-6">
      {/* Price Cards */}
      <PriceCards />
      
      {/* Divider */}
      <div className="border-t border-gray-200 mb-4 sm:mb-6"></div>
      
      <Tabs defaultValue="bots" className="space-y-4 sm:space-y-6">
        <div className="flex justify-start">
          <TabsList className="inline-flex h-9 sm:h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
            <TabsTrigger value="bots" className="px-3 sm:px-6 text-xs sm:text-sm">
              Trading Bots
            </TabsTrigger>
            <TabsTrigger value="account" className="px-3 sm:px-6 text-xs sm:text-sm">
              Account Summary
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="bots" className="space-y-4">
          <TradingBotsTab />
        </TabsContent>

        <TabsContent value="account" className="space-y-4">
          {/* Mobile restriction for Account Summary */}
          <div className="block sm:hidden">
            <div className="text-center py-8 px-4">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Desktop Only Feature</h3>
              <p className="text-sm text-gray-600 mb-4">
                The Account Summary tab requires a larger screen for optimal viewing. 
                Please access this feature on a desktop or tablet device.
              </p>
              <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-500">
                <p className="font-medium mb-1">Available on:</p>
                <ul className="space-y-1">
                  <li>• Desktop computers (1024px+)</li>
                  <li>• Tablets in landscape mode</li>
                  <li>• Large mobile devices in landscape</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Desktop Account Summary */}
          <div className="hidden sm:block">
            {authLoading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Loading permissions...</p>
              </div>
            ) : availableAccounts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-red-600 font-medium">No accounts available</p>
                <p className="text-sm text-muted-foreground mt-2">
                  You don't have permissions to access any accounts. 
                  <br />
                  Your permissions: {userPermissions.join(', ') || 'None'}
                </p>
              </div>
            ) : (
              <AccountSummaryTab 
                selectedAccount={selectedAccount}
                accounts={availableAccounts}
                onAccountChange={setSelectedAccount}
                positions={dummyPositions}
                orders={[]}
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
