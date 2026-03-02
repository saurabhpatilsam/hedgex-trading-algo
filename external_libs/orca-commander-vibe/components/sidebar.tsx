'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { 
  BarChart3, 
  Settings, 
  Wifi, 
  Menu,
  X,
  ChevronRight,
  Sparkles,
  Activity
} from 'lucide-react';
import { useRedisStatus } from '@/hooks/useRedisStatus';
import { OrcaLogoFull } from '@/components/orca-logo';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isMobileOpen?: boolean;
  onMobileToggle?: (open: boolean) => void;
}

const navigationItems = [
  {
    id: 'account-summary',
    label: 'Dashboard',
    icon: BarChart3,
    description: 'View account details and performance'
  },
  {
    id: 'trading-setup',
    label: 'Trading Setup',
    icon: Settings,
    description: 'Configure trading parameters and strategies'
  },
  {
    id: 'connections',
    label: 'Connections',
    icon: Wifi,
    description: 'Manage data feeds and connections'
  }
];

export function Sidebar({ 
  activeTab, 
  onTabChange, 
  isMobileOpen: externalMobileOpen, 
  onMobileToggle 
}: SidebarProps) {
  const { isConnected, isLoading } = useRedisStatus();
  
  // Use internal state if external state management is not provided
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  
  const isMobileOpen = onMobileToggle ? externalMobileOpen : internalMobileOpen;
  const setIsMobileOpen = onMobileToggle ? onMobileToggle : setInternalMobileOpen;

  const handleCleanupConnections = async () => {
    try {
      const response = await fetch('/api/connection-cleanup', { method: 'POST' });
      const result = await response.json();
      console.log('Connection cleanup result:', result);
    } catch (error) {
      console.error('Failed to cleanup connections:', error);
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed left-0 top-0 z-50 h-full w-64 border-r bg-background transition-transform duration-300 ease-in-out",
        "lg:translate-x-0",
        isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-16 items-center border-b px-4 bg-gradient-to-r from-sidebar-background to-sidebar-background/80">
            <div className="flex items-center">
              <OrcaLogoFull className="h-10" />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-8 w-8 lg:hidden"
              onClick={() => setIsMobileOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              
              return (
                <Button
                  key={item.id}
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3 h-10 px-3",
                    isActive && "bg-secondary text-secondary-foreground"
                  )}
                  onClick={() => {
                    onTabChange(item.id);
                    setIsMobileOpen(false); // Close mobile menu when item is clicked
                  }}
                >
                  <Icon className="h-4 w-4" />
                  <span className="font-medium">{item.label}</span>
                  {isActive && <ChevronRight className="ml-auto h-4 w-4" />}
                </Button>
              );
            })}
          </nav>

          {/* Footer with Redis Status */}
          <div className="border-t p-4">
            <div className="space-y-3">
              {/* Redis Connection Status */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Redis</span>
                  <div className={cn(
                    "h-2 w-2 rounded-full",
                    isLoading ? "bg-yellow-500" : (isConnected ? "bg-green-500" : "bg-red-500")
                  )}></div>
                  <span className="text-xs text-muted-foreground">
                    {isLoading ? 'Connecting...' : (isConnected ? 'Connected' : 'Disconnected')}
                  </span>
                </div>
                
                {/* Cleanup Button */}
                <button 
                  onClick={handleCleanupConnections}
                  className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer"
                >
                  Cleanup Connections
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
