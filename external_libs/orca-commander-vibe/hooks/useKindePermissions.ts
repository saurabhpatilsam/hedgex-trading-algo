import { useAuth } from "@/hooks/useAuth";
import { useMemo, useState, useEffect } from "react";
import { Account } from "@/lib/types";

export function useKindePermissions() {
  const isAuthDisabled = process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true';
  
  // Use better-auth instead of Kinde
  const auth = useAuth();
  
  // Override values when auth is disabled
  const { user, isAuthenticated, isLoading } = isAuthDisabled
    ? { user: null, isAuthenticated: true, isLoading: false }
    : auth;
  
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);

  // Fetch user permissions from API
  useEffect(() => {
    const fetchPermissions = async () => {
      // Skip fetching permissions if auth is disabled
      if (isAuthDisabled) {
        setUserPermissions(['*']); // Grant all permissions
        return;
      }
      
      if (!isAuthenticated) {
        setUserPermissions([]);
        return;
      }

      setPermissionsLoading(true);
      try {
        const response = await fetch('/api/user/permissions');
        if (response.ok) {
          const data = await response.json();
          console.log('Permissions API response:', data);
          console.log('Permissions array:', data.permissions);
          setUserPermissions(data.permissions || []);
        } else {
          console.error('Failed to fetch permissions');
          setUserPermissions([]);
        }
      } catch (error) {
        console.error('Error fetching permissions:', error);
        setUserPermissions([]);
      } finally {
        setPermissionsLoading(false);
      }
    };

    fetchPermissions();
  }, [isAuthenticated, isAuthDisabled]);

  // Filter accounts based on user permissions
  const filterAccountsByPermissions = (accounts: Account[]): Account[] => {
    // When auth is disabled, return all accounts
    if (isAuthDisabled) {
      return accounts;
    }
    
    if (!isAuthenticated || !Array.isArray(userPermissions) || userPermissions.length === 0) {
      return [];
    }

    // Filter accounts where the owner matches one of the user's permissions
    return accounts.filter(account => {
      if (!account.owner) return false;
      return userPermissions.includes(account.owner);
    });
  };

  // Get unique owners from filtered accounts
  const getAvailableOwners = (accounts: Account[]): string[] => {
    const filteredAccounts = filterAccountsByPermissions(accounts);
    const ownersSet = new Set(filteredAccounts.map(account => account.owner));
    const owners = Array.from(ownersSet);
    return owners.sort();
  };

  return {
    userPermissions,
    filterAccountsByPermissions,
    getAvailableOwners,
    isAuthenticated,
    isLoading: isLoading || permissionsLoading,
    user
  };
}
