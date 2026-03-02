'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SubAccountSelector } from '@/components/subaccount-selector';
import { Badge } from '@/components/ui/badge';

const mainAccounts = [
  'APEX_136189',
  'APEX_265995',
  'APEX_266668',
  'APEX_272045',
];

export default function TestSubAccountsPage() {
  const [selectedMainAccount, setSelectedMainAccount] = useState('APEX_272045');
  const [selectedSubAccounts, setSelectedSubAccounts] = useState<Array<{ tv_id: string; ta_id: string }>>([]);

  const handleSubmit = () => {
    console.log('Selected Configuration:', {
      mainAccount: selectedMainAccount,
      subAccounts: selectedSubAccounts,
    });
    
    // Display alert with the selection
    if (selectedSubAccounts.length > 0) {
      alert(`Selected ${selectedSubAccounts.length} sub-account(s) for ${selectedMainAccount}:\n\n` +
        selectedSubAccounts.map(sa => `${sa.ta_id} (${sa.tv_id})`).join('\n'));
    } else {
      alert('Please select at least one sub-account');
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Test Account & Sub-Account Selection</CardTitle>
          <CardDescription>
            Demo of Redis-based account structure with sub-account selection for bot deployment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Main Account Selection */}
          <div className="space-y-2">
            <Label htmlFor="mainAccount">Main Account</Label>
            <Select 
              value={selectedMainAccount} 
              onValueChange={(value) => {
                setSelectedMainAccount(value);
                setSelectedSubAccounts([]); // Reset sub-accounts when main account changes
              }}
            >
              <SelectTrigger id="mainAccount">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mainAccounts.map(account => (
                  <SelectItem key={account} value={account}>
                    {account}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sub-Account Selection */}
          <div className="space-y-2">
            <Label htmlFor="subAccounts">Sub-accounts</Label>
            <SubAccountSelector
              mainAccount={selectedMainAccount}
              selectedSubAccounts={selectedSubAccounts}
              onSubAccountsChange={setSelectedSubAccounts}
              placeholder="Select sub-accounts to run the algorithm on..."
            />
            <p className="text-xs text-muted-foreground">
              Select which sub-accounts to run this bot configuration on. You can select individual accounts or all accounts.
            </p>
          </div>

          {/* Display Selected Sub-accounts */}
          {selectedSubAccounts.length > 0 && (
            <div className="space-y-2">
              <Label>Selected Sub-accounts ({selectedSubAccounts.length})</Label>
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex flex-wrap gap-2">
                  {selectedSubAccounts.map((sa) => (
                    <Badge key={sa.tv_id} variant="secondary">
                      {sa.ta_id} ({sa.tv_id})
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Payload Preview */}
          <div className="space-y-2">
            <Label>API Payload Preview</Label>
            <div className="p-4 bg-muted rounded-lg font-mono text-sm">
              <pre>
{JSON.stringify({
  main_account: selectedMainAccount,
  selected_subaccounts: selectedSubAccounts,
  // Other bot configuration would go here
  contract: 'NQ',
  trading_mode: 'BreakThrough',
  // etc...
}, null, 2)}
              </pre>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={() => setSelectedSubAccounts([])}
              disabled={selectedSubAccounts.length === 0}
            >
              Clear Selection
            </Button>
            <Button onClick={handleSubmit}>
              Test Submit
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
