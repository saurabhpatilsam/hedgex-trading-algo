'use client';

export function Providers({ children }: { children: React.ReactNode }) {
  // Better-auth doesn't need a provider wrapper - authentication is handled via API routes
  return <>{children}</>;
}
