'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { OrcaMaxConfig, Contract, TradingMode, TradingSide, PointPosition, Environment } from '@/lib/types';
import { toast } from 'sonner';
import { Loader2, X } from 'lucide-react';
import { SubAccountSelector } from '@/components/subaccount-selector';

interface OrcaMaxConfigFormProps {
  onSubmit: (config: OrcaMaxConfig) => Promise<void>;
  onCancel: () => void;
  availableAccounts: string[];
  initialConfig?: OrcaMaxConfig;
}

export function OrcaMaxConfigForm({ onSubmit, onCancel, availableAccounts, initialConfig }: OrcaMaxConfigFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSubAccounts, setSelectedSubAccounts] = useState<Array<{ tv_id: string; ta_id: string }>>([]);
  const [config, setConfig] = useState<OrcaMaxConfig>(
    initialConfig || {
      accountName: availableAccounts[0] || 'APEX_136189',
      contract: 'NQ',
      trading_mode: 'BreakThrough',
      trading_side: 'UP',
      point_strategy_key: '15_7_5_2',
      point_position: 'a',
      exit_strategy_key: '15_15',
      dateFrom: new Date().toISOString().slice(0, 16),
      dateTo: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      quantity: 1,
      environment: 'DEV',
      accounts_ids: '',
      notes: '',
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate sub-account selection
    if (selectedSubAccounts.length === 0) {
      toast.error('Please select at least one sub-account');
      return;
    }

    setIsSubmitting(true);
    try {
      // Include selected sub-accounts in the config
      const configWithSubAccounts = {
        ...config,
        selected_subaccounts: selectedSubAccounts,
      };
      await onSubmit(configWithSubAccounts as OrcaMaxConfig);
    } catch (error) {
      console.error('Error submitting OrcaMax config:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateConfig = <K extends keyof OrcaMaxConfig>(field: K, value: OrcaMaxConfig[K]) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b bg-white dark:bg-gray-950">
        <CardTitle className="text-xl font-semibold">
          {initialConfig ? 'Edit OrcaMax Bot Configuration' : 'OrcaMax Bot Configuration'}
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          {initialConfig 
            ? 'Modify the configuration below and deploy a new bot instance'
            : 'Configure and deploy an OrcaMax trading bot with your strategy parameters'
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 bg-gray-50/50 dark:bg-gray-900/50">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Account Selection Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Account Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="accountName" className="text-sm font-medium">
                  Main Account
                </Label>
                <Select 
                  value={config.accountName} 
                  onValueChange={(value) => {
                    updateConfig('accountName', value);
                    // Reset sub-account selection when main account changes
                    setSelectedSubAccounts([]);
                  }}
                >
                  <SelectTrigger id="accountName" className="w-full bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 focus:ring-2 focus:ring-blue-500/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAccounts.map(account => (
                      <SelectItem key={account} value={account}>
                        {account}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contract" className="text-sm font-medium">
                  Contract
                </Label>
                <Select 
                  value={config.contract} 
                  onValueChange={(value: Contract) => updateConfig('contract', value)}
                >
                  <SelectTrigger id="contract" className="w-full bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 focus:ring-2 focus:ring-blue-500/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NQ">NQ (Nasdaq-100)</SelectItem>
                    <SelectItem value="ES">ES (S&P 500)</SelectItem>
                    <SelectItem value="GC">GC (Gold)</SelectItem>
                    <SelectItem value="MNQ">MNQ (Micro Nasdaq)</SelectItem>
                    <SelectItem value="MES">MES (Micro S&P)</SelectItem>
                    <SelectItem value="MGC">MGC (Micro Gold)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Sub-account Selection */}
            <div className="space-y-2">
              <Label htmlFor="subAccounts" className="text-sm font-medium">
                Sub-accounts
              </Label>
              <SubAccountSelector
                mainAccount={config.accountName}
                selectedSubAccounts={selectedSubAccounts}
                onSubAccountsChange={setSelectedSubAccounts}
                placeholder="Select sub-accounts to run the algorithm on..."
              />
              <p className="text-xs text-muted-foreground">
                Select which sub-accounts to run this bot configuration on. You can select individual accounts or all accounts.
              </p>
              
              {/* Display Selected Account IDs */}
              {selectedSubAccounts.length > 0 && (
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                        Selected Accounts ({selectedSubAccounts.length})
                      </span>
                      <Badge variant="default" className="bg-blue-600">
                        {selectedSubAccounts.length} account{selectedSubAccounts.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      {selectedSubAccounts.map((account) => (
                        <div 
                          key={account.tv_id} 
                          className="flex items-center justify-between p-2 bg-white dark:bg-gray-950 rounded border border-gray-200 dark:border-gray-700 group hover:border-red-300 dark:hover:border-red-700 transition-colors"
                        >
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                              TV: {account.tv_id}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              TA: {account.ta_id}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSubAccounts(selectedSubAccounts.filter(sa => sa.tv_id !== account.tv_id));
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                            title="Remove account"
                          >
                            <X className="h-3 w-3 text-red-600 dark:text-red-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Trading Configuration Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Trading Strategy</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="trading_mode" className="text-sm font-medium">
                  Trading Mode
                </Label>
              <Select 
                value={config.trading_mode} 
                onValueChange={(value: TradingMode) => updateConfig('trading_mode', value)}
              >
                <SelectTrigger id="trading_mode" className="w-full bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 focus:ring-2 focus:ring-blue-500/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BreakThrough">Break Through</SelectItem>
                  <SelectItem value="Reverse">Reverse</SelectItem>
                </SelectContent>
              </Select>
            </div>
                    <div className="space-y-2">
                <Label htmlFor="trading_side" className="text-sm font-medium">
                  Trading Side
                </Label>
              <Select 
                value={config.trading_side} 
                onValueChange={(value: TradingSide) => updateConfig('trading_side', value)}
              >
                <SelectTrigger id="trading_side" className="w-full bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 focus:ring-2 focus:ring-blue-500/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UP">Up</SelectItem>
                  <SelectItem value="DOWN">Down</SelectItem>
                </SelectContent>
              </Select>
            </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      

            <div className="space-y-2">
              <Label htmlFor="point_position" className="text-sm font-medium">
                Point Position
              </Label>
              <Select 
                value={config.point_position} 
                onValueChange={(value: PointPosition) => updateConfig('point_position', value)}
              >
                <SelectTrigger id="point_position" className="w-full bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 focus:ring-2 focus:ring-blue-500/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a">Position A</SelectItem>
                  <SelectItem value="b">Position B</SelectItem>
                  <SelectItem value="c">Position C</SelectItem>
                </SelectContent>
              </Select>
            </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="point_strategy_key" className="text-sm font-medium">
                  Point Strategy Key
                </Label>
                <Input
                  id="point_strategy_key"
                  value={config.point_strategy_key}
                  onChange={(e) => updateConfig('point_strategy_key', e.target.value)}
                  placeholder="e.g., 15_7_5_2"
                  required
                  className="w-full bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="exit_strategy_key" className="text-sm font-medium">
                  Exit Strategy Key
                </Label>
                <Input
                  id="exit_strategy_key"
                  value={config.exit_strategy_key}
                  onChange={(e) => updateConfig('exit_strategy_key', e.target.value)}
                  placeholder="e.g., 15_15"
                  required
                  className="w-full bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
          
          {/* Date Range */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Schedule</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dateFrom" className="text-sm font-medium">
                  Start Date & Time
                </Label>
                <Input
                  id="dateFrom"
                  type="datetime-local"
                  value={config.dateFrom}
                  onChange={(e) => updateConfig('dateFrom', e.target.value)}
                  required
                  className="w-full bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dateTo" className="text-sm font-medium">
                  End Date & Time
                </Label>
                <Input
                  id="dateTo"
                  type="datetime-local"
                  value={config.dateTo}
                  onChange={(e) => updateConfig('dateTo', e.target.value)}
                  required
                  className="w-full bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity" className="text-sm font-medium">
                Quantity
              </Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={config.quantity}
                onChange={(e) => updateConfig('quantity', parseInt(e.target.value) || 1)}
                required
                className="w-full bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="environment" className="text-sm font-medium">
                Environment
              </Label>
              <Select 
                value={config.environment} 
                onValueChange={(value: Environment) => updateConfig('environment', value)}
              >
                <SelectTrigger id="environment" className="w-full bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 focus:ring-2 focus:ring-blue-500/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEV">Development</SelectItem>
                  <SelectItem value="DEV_SB">Development Sandbox</SelectItem>
                  <SelectItem value="PROD">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Optional Fields */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Additional Information</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="accounts_ids" className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Account IDs
                </Label>
                <Input
                  id="accounts_ids"
                  value={config.accounts_ids}
                  onChange={(e) => updateConfig('accounts_ids', e.target.value)}
                  placeholder="Comma-separated account IDs"
                  className="w-full bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Notes
                </Label>
                <Textarea
                  id="notes"
                  value={config.notes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateConfig('notes', e.target.value)}
                  placeholder="Add any notes about this bot configuration..."
                  rows={3}
                  className="w-full resize-none bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-8 border-t border-gray-200 dark:border-gray-800">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onCancel} 
              disabled={isSubmitting}
              className="border-gray-300 dark:border-gray-700"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deploying...
                </>
              ) : (
                'Deploy Bot'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
