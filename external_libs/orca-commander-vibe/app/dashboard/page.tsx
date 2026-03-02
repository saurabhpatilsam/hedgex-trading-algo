'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth-guard';
import { Sidebar } from '@/components/sidebar';
import { AccountSummaryContent } from '@/components/account-summary-content';
import { TradingSetupTab } from '@/components/trading-setup-tab';
import { ConnectionsTab } from '@/components/connections-tab';
import { Toaster, toast } from 'sonner';
import { useRedisStatus } from '@/hooks/useRedisStatus';
import { AuthAPI } from '@/lib/api/auth-api';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LogOut, Menu, User } from 'lucide-react';

export default function DashboardPage() {
  const { isConnected, isLoading, redisHost } = useRedisStatus();
  const [activeTab, setActiveTab] = useState('account-summary');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const router = useRouter();

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [userName, setUserName] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');

  // Load user data from localStorage
  useEffect(() => {
    const userDataStr = localStorage.getItem('user');
    if (userDataStr) {
      try {
        const userData = JSON.parse(userDataStr);
        setUserName(userData.name || 'User');
        setUserEmail(userData.email || '');
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }
  }, []);

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!userName) return 'U';
    const names = userName.split(' ');
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    }
    return userName.substring(0, 2).toUpperCase();
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    
    toast.loading('Signing out...', { id: 'logout' });
    
    try {
      await AuthAPI.signout();
      
      toast.success('Signed out successfully', { 
        id: 'logout',
        duration: 2000,
      });
      
      // Smooth transition
      setTimeout(() => {
        router.push('/sign-in');
      }, 300);
    } catch (error) {
      toast.error('Sign out failed', { 
        id: 'logout',
        description: 'Please try again.',
      });
      setIsLoggingOut(false);
    }
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 'account-summary':
        return 'Dashboard';
      case 'trading-setup':
        return 'Trading Setup';
      case 'connections':
        return 'Connections';
      default:
        return 'Dashboard';
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'account-summary':
        return <AccountSummaryContent />;
      case 'trading-setup':
        return <TradingSetupTab />;
      case 'connections':
        return <ConnectionsTab />;
      default:
        return <AccountSummaryContent />;
    }
  };

  return (
    <AuthGuard>
      <div className="flex h-screen bg-background">
        <Sidebar 
          activeTab={activeTab} 
          onTabChange={setActiveTab}
          isMobileOpen={isMobileOpen}
          onMobileToggle={setIsMobileOpen}
        />
        
        {/* Main content area */}
        <div className="flex-1 flex flex-col lg:ml-64">
          {/* Mobile header - only visible on mobile */}
          <header className="flex h-16 items-center gap-3 border-b bg-background px-4 lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsMobileOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>
            <h1 className="text-base font-semibold flex-1">
              {getPageTitle()}
            </h1>
            
            {/* User Profile - Mobile */}
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8 border-2 border-primary/20">
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs font-semibold">
                  {getUserInitials()}
                </AvatarFallback>
              </Avatar>
              <Button 
                variant="ghost" 
                size="icon"
                className="h-8 w-8" 
                onClick={handleLogout}
                disabled={isLoggingOut}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>

          {/* Desktop header - only visible on desktop */}
          <header className="hidden lg:flex h-16 items-center gap-4 border-b border-primary/10 bg-gradient-to-r from-background via-background to-primary/5 px-6 backdrop-blur-sm">
            <div className="flex-1 flex items-center gap-3">
              <div className="h-8 w-1 bg-gradient-to-b from-primary to-primary/30 rounded-full"></div>
              <h1 className="text-xl font-semibold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {getPageTitle()}
              </h1>
            </div>
            
            {/* User Profile Section - Desktop */}
            <div className="flex items-center gap-4">
              {/* User Info */}
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card/50 border border-primary/20 hover:bg-card/70 hover:border-primary/30 transition-all shadow-sm">
                <Avatar className="h-9 w-9 border-2 border-primary/40 shadow-md ring-2 ring-primary/10">
                  <AvatarFallback className="bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600 text-white font-semibold text-sm">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground leading-tight">
                    {userName || 'User'}
                  </span>
                  <span className="text-xs text-muted-foreground leading-tight">
                    {userEmail || 'user@example.com'}
                  </span>
                </div>
              </div>
              
              {/* Logout Button */}
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2 border-destructive/30 hover:bg-destructive/90 hover:text-white hover:border-destructive transition-all shadow-sm" 
                onClick={handleLogout}
                disabled={isLoggingOut}
              >
                <LogOut className="h-4 w-4" />
                {isLoggingOut ? 'Signing out...' : 'Logout'}
              </Button>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-auto p-4 lg:p-6">
            {renderContent()}
          </main>
        </div>

        <Toaster />
      </div>
    </AuthGuard>
  );
}
