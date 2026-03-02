import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Account } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AccountSelectorProps {
  accounts: Account[];
  selectedAccount: Account;
  onAccountChange: (account: Account) => void;
}

export function AccountSelector({ accounts, selectedAccount, onAccountChange }: AccountSelectorProps) {
  const [open, setOpen] = useState(false);

  // Group accounts by owner
  const groupedAccounts = accounts.reduce((groups, account) => {
    const owner = account.owner || 'Default';
    if (!groups[owner]) {
      groups[owner] = [];
    }
    groups[owner].push(account);
    return groups;
  }, {} as Record<string, Account[]>);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-auto min-w-[200px] h-8 justify-between"
        >
          <span className="text-xs truncate">Account: {selectedAccount.owner} / {selectedAccount.name}</span>
          <ChevronDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search accounts..." className="border-0 focus:ring-0" />
          <CommandList>
            <CommandEmpty>No account found.</CommandEmpty>
            {Object.entries(groupedAccounts).map(([owner, ownerAccounts]) => (
              <CommandGroup key={owner} heading={owner} className="[&_[cmdk-group-heading]]:text-sm [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-foreground [&_[cmdk-group-heading]]:bg-muted/50 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:rounded-sm">
                {ownerAccounts.map((account) => (
                  <CommandItem
                    key={account.id}
                    value={`${account.name} ${account.owner}`}
                    onSelect={() => {
                      onAccountChange(account);
                      setOpen(false);
                    }}
                  >
                    <div className="flex flex-col">
                      <span className={cn(
                        "text-sm",
                        selectedAccount.id === account.id ? "font-medium" : "font-normal"
                      )}>
                        {account.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {account.id}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
