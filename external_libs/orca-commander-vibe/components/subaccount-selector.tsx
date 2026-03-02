'use client';

import { useState, useEffect } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

interface SubAccount {
  id: string;
  name: string;
  currency?: string;
  locale?: string | null;
}

interface SubAccountSelectorProps {
  mainAccount: string;
  selectedSubAccounts: Array<{ tv_id: string; ta_id: string }>;
  onSubAccountsChange: (subAccounts: Array<{ tv_id: string; ta_id: string }>) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SubAccountSelector({
  mainAccount,
  selectedSubAccounts,
  onSubAccountsChange,
  placeholder = 'Select sub-accounts...',
  className,
  disabled = false,
}: SubAccountSelectorProps) {
  const [open, setOpen] = useState(false);
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectAll, setSelectAll] = useState(false);

  // Fetch sub-accounts when main account changes
  useEffect(() => {
    if (!mainAccount) {
      setSubAccounts([]);
      return;
    }

    const fetchSubAccounts = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/accounts/subaccounts?mainAccount=${encodeURIComponent(mainAccount)}`);
        const data = await response.json();
        
        if (data.success && data.subAccounts) {
          setSubAccounts(data.subAccounts);
          
          // Check if all sub-accounts are selected
          if (data.subAccounts.length > 0) {
            const allSelected = data.subAccounts.every((sa: SubAccount) => 
              selectedSubAccounts.some(selected => selected.tv_id === sa.id)
            );
            setSelectAll(allSelected);
          }
        } else if (data.error) {
          setError(data.error);
          setSubAccounts([]);
        }
      } catch (err) {
        setError('Failed to fetch sub-accounts');
        setSubAccounts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSubAccounts();
  }, [mainAccount]);

  // Update selectAll state when selection changes
  useEffect(() => {
    if (subAccounts.length > 0) {
      const allSelected = subAccounts.every(sa => 
        selectedSubAccounts.some(selected => selected.tv_id === sa.id)
      );
      setSelectAll(allSelected);
    }
  }, [selectedSubAccounts, subAccounts]);

  const handleSelectAll = () => {
    if (selectAll) {
      // Deselect all
      onSubAccountsChange([]);
    } else {
      // Select all
      const allSubAccounts = subAccounts.map(sa => ({
        tv_id: sa.id,
        ta_id: sa.name
      }));
      onSubAccountsChange(allSubAccounts);
    }
  };

  const handleToggleSubAccount = (subAccount: SubAccount) => {
    const isSelected = selectedSubAccounts.some(sa => sa.tv_id === subAccount.id);
    
    if (isSelected) {
      onSubAccountsChange(
        selectedSubAccounts.filter(sa => sa.tv_id !== subAccount.id)
      );
    } else {
      onSubAccountsChange([
        ...selectedSubAccounts,
        { tv_id: subAccount.id, ta_id: subAccount.name }
      ]);
    }
  };

  const getButtonText = () => {
    if (!mainAccount) {
      return 'Select main account first';
    }
    
    if (loading) {
      return 'Loading sub-accounts...';
    }
    
    if (selectedSubAccounts.length === 0) {
      return placeholder || 'Select sub-accounts';
    }
    
    if (selectedSubAccounts.length === subAccounts.length && subAccounts.length > 0) {
      return `All ${selectedSubAccounts.length} sub-accounts selected`;
    }
    
    if (selectedSubAccounts.length === 1) {
      return `${selectedSubAccounts[0].tv_id} (${selectedSubAccounts[0].ta_id})`;
    }
    
    return `${selectedSubAccounts.length} sub-accounts selected`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 focus:ring-2 focus:ring-blue-500/20',
            !selectedSubAccounts.length && 'text-muted-foreground',
            className
          )}
          disabled={disabled || loading || !mainAccount}
        >
          <span className="truncate">{getButtonText()}</span>
          {loading ? (
            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700">
        <Command>
          <CommandInput placeholder="Search sub-accounts..." className="border-b border-gray-200 dark:border-gray-800" />
          <div className="h-[300px] overflow-auto">
            <CommandEmpty>No sub-accounts found.</CommandEmpty>
            <CommandGroup>
              {/* Select All Option */}
              {subAccounts.length > 1 && (
                <CommandItem
                  onSelect={handleSelectAll}
                  className="font-medium border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900"
                >
                  <Checkbox
                    checked={selectAll}
                    onCheckedChange={handleSelectAll}
                    className="mr-2"
                  />
                  <span className="font-semibold">Select All ({subAccounts.length} accounts)</span>
                </CommandItem>
              )}
              
              {/* Individual Sub-accounts */}
              {subAccounts.map((subAccount) => {
                const isSelected = selectedSubAccounts.some(sa => sa.tv_id === subAccount.id);
                return (
                  <CommandItem
                    key={subAccount.id}
                    onSelect={() => handleToggleSubAccount(subAccount)}
                    className="hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggleSubAccount(subAccount)}
                      className="mr-2"
                    />
                    <div className="flex flex-col flex-1">
                      <span className="text-sm font-medium">{subAccount.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">TV: {subAccount.id}</span>
                        {subAccount.currency && (
                          <Badge 
                            variant="secondary" 
                            className="h-4 text-[10px]"
                          >
                            {subAccount.currency}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </div>
        </Command>
        
        {/* Selected Sub-accounts Summary */}
        {selectedSubAccounts.length > 0 && (
          <div className="p-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Selected Accounts
              </span>
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                {selectedSubAccounts.length} selected
              </span>
            </div>
            <div className="max-h-[100px] overflow-auto space-y-1">
              {selectedSubAccounts.map((sa) => (
                <div 
                  key={sa.tv_id} 
                  className="flex items-center justify-between p-1.5 bg-white dark:bg-gray-950 rounded border border-gray-200 dark:border-gray-700 text-xs"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      TV: {sa.tv_id}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      TA: {sa.ta_id}
                    </span>
                  </div>
                  <Badge 
                    variant="secondary"
                    className="text-[9px] bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-0 px-1.5 py-0.5"
                  >
                    ✓
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
