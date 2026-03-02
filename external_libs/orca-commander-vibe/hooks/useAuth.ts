import { useEffect, useState } from 'react';
import { AuthAPI, User } from '@/lib/api/auth-api';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      try {
        // Check if token exists
        if (AuthAPI.isAuthenticated()) {
          // Try to get current user from API
          const currentUser = await AuthAPI.getCurrentUser();
          setUser(currentUser);
          setIsAuthenticated(true);
        } else {
          // Check localStorage for stored user
          const storedUser = AuthAPI.getStoredUser();
          if (storedUser) {
            setUser(storedUser);
            setIsAuthenticated(true);
          }
        }
      } catch (error) {
        // Token might be expired or invalid
        console.error('Auth init error:', error);
        setIsAuthenticated(false);
        setUser(null);
        // Clear invalid token
        if (typeof window !== 'undefined') {
          localStorage.removeItem('access_token');
          localStorage.removeItem('user');
        }
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const refreshUser = async () => {
    try {
      const currentUser = await AuthAPI.getCurrentUser();
      setUser(currentUser);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Failed to refresh user:', error);
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  return {
    user,
    isAuthenticated,
    isLoading,
    refreshUser,
  };
}

// Hook for checking if user has specific permissions
export function usePermissions() {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);

  useEffect(() => {
    const fetchPermissions = async () => {
      if (!user) {
        setPermissions([]);
        return;
      }

      setPermissionsLoading(true);
      try {
        const result = await AuthAPI.getUserPermissions(user.id);
        setPermissions(result.permissions);
      } catch (error) {
        console.error('Error fetching permissions:', error);
        setPermissions([]);
      } finally {
        setPermissionsLoading(false);
      }
    };

    fetchPermissions();
  }, [user]);

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    return permissions.includes(permission);
  };

  const hasAnyPermission = (perms: string[]): boolean => {
    return perms.some(permission => hasPermission(permission));
  };

  const hasAllPermissions = (perms: string[]): boolean => {
    return perms.every(permission => hasPermission(permission));
  };

  return {
    permissions,
    permissionsLoading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
}
