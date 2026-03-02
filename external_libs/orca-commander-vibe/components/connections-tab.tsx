'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Plus, 
  Trash2, 
  Database, 
  User, 
  Users,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

interface RedisAccount {
  apexUser: string;
  accounts: string[];
}

export function ConnectionsTab() {
  const [accounts, setAccounts] = useState<RedisAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState('');
  const [selectedApexUser, setSelectedApexUser] = useState<string | null>(null);

  // Fetch Redis accounts data
  const fetchAccounts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // This would be your actual API call to fetch Redis data
      // For now, using mock data based on your description
      const mockData: RedisAccount[] = [
        {
          apexUser: 'APEX_136189',
          accounts: [
            'PAAPEX1361890000002',
            'PAAPEX1361890000007',
            'PAAPEX1361890000008',
            'PAAPEX1361890000009',
            'PAAPEX1361890000010'
          ]
        },
        {
          apexUser: 'APEX_265995',
          accounts: [
            'PAAPEX2659950000001',
            'PAAPEX2659950000002'
          ]
        },
        {
          apexUser: 'APEX_266668',
          accounts: [
            'PAAPEX2666680000001',
            'PAAPEX2666680000002',
            'PAAPEX2666680000003'
          ]
        },
        {
          apexUser: 'APEX_272045',
          accounts: [
            'PAAPEX2720450000001'
          ]
        }
      ];

      setAccounts(mockData);
    } catch (err) {
      setError('Failed to fetch Redis accounts');
      console.error('Error fetching accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  // Add new account to a specific APEX user
  const addAccount = async (apexUser: string, accountId: string) => {
    try {
      // This would be your actual API call to add account to Redis
      console.log(`Adding account ${accountId} to ${apexUser}`);
      
      setAccounts(prev => prev.map(acc => 
        acc.apexUser === apexUser 
          ? { ...acc, accounts: [...acc.accounts, accountId] }
          : acc
      ));
      
      setNewAccount('');
      setSelectedApexUser(null);
    } catch (err) {
      setError('Failed to add account');
      console.error('Error adding account:', err);
    }
  };

  // Remove account from a specific APEX user
  const removeAccount = async (apexUser: string, accountId: string) => {
    try {
      // This would be your actual API call to remove account from Redis
      console.log(`Removing account ${accountId} from ${apexUser}`);
      
      setAccounts(prev => prev.map(acc => 
        acc.apexUser === apexUser 
          ? { ...acc, accounts: acc.accounts.filter(a => a !== accountId) }
          : acc
      ));
    } catch (err) {
      setError('Failed to remove account');
      console.error('Error removing account:', err);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Manage your Tradovate users and account mappings
          </p>
          <Button onClick={fetchAccounts} disabled size="sm" variant="ghost" className="h-8 w-8 p-0">
            <RefreshCw className="h-3 w-3 animate-spin" />
          </Button>
        </div>
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="h-3 bg-gray-200 rounded w-1/3 animate-pulse"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="h-2 bg-gray-200 rounded w-1/2 animate-pulse"></div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Manage your Tradovate users and account mappings
        </p>
        <Button onClick={fetchAccounts} size="sm" variant="ghost" className="h-8 w-8 p-0">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="h-3 w-3" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {accounts.map((account) => (
          <Card key={account.apexUser}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                  <User className="h-3 w-3 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-base">{account.apexUser}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {account.accounts.length} account{account.accounts.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Account List */}
              <div className="grid gap-1">
                {account.accounts.map((acc) => (
                  <div key={acc} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      <Users className="h-3 w-3 text-gray-500" />
                      <span className="font-mono text-xs">{acc}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAccount(account.apexUser, acc)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 h-6 w-6 p-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Add New Account */}
              {selectedApexUser === account.apexUser ? (
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter account ID (e.g., PAAPEX1361890000011)"
                    value={newAccount}
                    onChange={(e) => setNewAccount(e.target.value)}
                    className="flex-1 text-sm"
                    size={1}
                  />
                  <Button
                    onClick={() => addAccount(account.apexUser, newAccount)}
                    disabled={!newAccount.trim()}
                    size="sm"
                    className="gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedApexUser(null);
                      setNewAccount('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedApexUser(account.apexUser)}
                  className="gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Add Account
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {accounts.length === 0 && !loading && (
        <Card>
          <CardContent className="pt-4">
            <div className="text-center py-6">
              <Database className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <h3 className="text-sm font-medium text-gray-900 mb-1">No Redis Accounts Found</h3>
              <p className="text-xs text-gray-600">
                No APEX user accounts are currently configured in Redis.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
