'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

export default function TestAccountsPage() {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string>('');

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/accounts');
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch accounts');
        }
        
        if (data.success) {
          setAccounts(data.accounts || []);
          setSource(data.source || 'unknown');
        } else {
          throw new Error('Invalid response format');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch accounts');
        // Set fallback accounts
        setAccounts(['APEX_136189', 'APEX_265995', 'APEX_266668', 'APEX_272045']);
        setSource('fallback');
      } finally {
        setLoading(false);
      }
    };

    fetchAccounts();
  }, []);

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Test Accounts API</CardTitle>
          <CardDescription>
            Testing the /api/accounts endpoint to fetch all main accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading accounts...</span>
            </div>
          ) : error ? (
            <div className="space-y-4">
              <div className="text-red-600 dark:text-red-400">
                Error: {error}
              </div>
              <div className="text-sm text-muted-foreground">
                Showing fallback accounts:
              </div>
              <div className="flex flex-wrap gap-2">
                {accounts.map((account) => (
                  <Badge key={account} variant="secondary">
                    {account}
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Source:</span>
                <Badge variant={source === 'redis' ? 'default' : 'secondary'}>
                  {source}
                </Badge>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium">
                  Found {accounts.length} accounts:
                </h3>
                <div className="flex flex-wrap gap-2">
                  {accounts.map((account) => (
                    <Badge key={account} className="px-3 py-1">
                      {account}
                    </Badge>
                  ))}
                </div>
              </div>
              {accounts.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  No accounts found. Check Redis connection or data.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
