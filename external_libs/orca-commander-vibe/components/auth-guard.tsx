'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

interface AuthGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
}

/**
 * AuthGuard component that protects routes from unauthorized access
 * Redirects to sign-in page if user is not authenticated
 */
export function AuthGuard({ children, redirectTo = '/sign-in' }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  // Check if auth is disabled via environment variable
  const isAuthDisabled = process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true';

  useEffect(() => {
    // Skip auth check if disabled
    if (isAuthDisabled) return;

    // Redirect if not authenticated and not loading
    if (!isLoading && !isAuthenticated) {
      router.push(redirectTo);
    }
  }, [isAuthenticated, isLoading, router, redirectTo, isAuthDisabled]);

  // Show loading state while checking authentication
  if (!isAuthDisabled && isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4 animate-pulse">
            <span className="text-primary-foreground text-2xl font-bold">O</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">Orca Trading Dashboard</h1>
          <p className="text-muted-foreground">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  // Don't render children if not authenticated (unless auth is disabled)
  if (!isAuthDisabled && !isAuthenticated) {
    return null;
  }

  // Render children if authenticated or auth is disabled
  return <>{children}</>;
}
