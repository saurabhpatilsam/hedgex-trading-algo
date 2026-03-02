/**
 * Authentication API client
 * Communicates with backend API for all auth operations
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_PREFIX = '/api/v1';

// Custom error class for authentication errors
export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorCode?: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// Helper function to get user-friendly error messages
function getUserFriendlyError(error: any, defaultMessage: string): string {
  if (error.detail) {
    const detail = error.detail.toLowerCase();
    
    // Invalid credentials
    if (detail.includes('invalid') || detail.includes('incorrect') || detail.includes('wrong')) {
      return 'Invalid email or password. Please check your credentials and try again.';
    }
    
    // Account not found
    if (detail.includes('not found') || detail.includes('does not exist')) {
      return 'No account found with this email address.';
    }
    
    // Account not confirmed
    if (detail.includes('not confirmed') || detail.includes('pending')) {
      return 'Your account is pending approval. Please wait for confirmation.';
    }
    
    // Account inactive
    if (detail.includes('inactive') || detail.includes('disabled')) {
      return 'Your account has been deactivated. Please contact support.';
    }
    
    // Email already exists
    if (detail.includes('already exists') || detail.includes('already registered')) {
      return 'An account with this email already exists.';
    }
    
    // Weak password
    if (detail.includes('password') && (detail.includes('weak') || detail.includes('short'))) {
      return 'Password is too weak. Please use a stronger password.';
    }
    
    return error.detail;
  }
  
  return defaultMessage;
}

export interface SignupData {
  email: string;
  password: string;
  name: string;
}

export interface SigninData {
  email: string;
  password: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  confirmed: boolean;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export class AuthAPI {
  private static getAuthHeader(): HeadersInit {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  /**
   * Sign up a new user
   */
  static async signup(data: SignupData): Promise<User> {
    try {
      const response = await fetch(`${API_BASE_URL}${API_PREFIX}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Signup failed' }));
        const friendlyMessage = getUserFriendlyError(error, 'Sign up failed. Please try again.');
        throw new AuthError(friendlyMessage, response.status, error.code);
      }

      return response.json();
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new AuthError('Unable to connect to server. Please check your internet connection.');
      }
      throw new AuthError('An unexpected error occurred during sign up.');
    }
  }

  /**
   * Sign in with email and password
   */
  static async signin(data: SigninData): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}${API_PREFIX}/auth/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Sign in failed' }));
        const friendlyMessage = getUserFriendlyError(error, 'Sign in failed. Please try again.');
        throw new AuthError(friendlyMessage, response.status, error.code);
      }

      const authData = await response.json();
      
      // Store token in localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('access_token', authData.access_token);
        localStorage.setItem('user', JSON.stringify(authData.user));
      }

      return authData;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      // Network or other errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new AuthError('Unable to connect to server. Please check your internet connection.');
      }
      throw new AuthError('An unexpected error occurred. Please try again.');
    }
  }

  /**
   * Sign out current user
   */
  static async signout(): Promise<void> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    
    if (token) {
      try {
        await fetch(`${API_BASE_URL}${API_PREFIX}/auth/signout`, {
          method: 'POST',
          headers: {
            ...this.getAuthHeader(),
          },
        });
      } catch (error) {
        console.error('Signout error:', error);
      }
    }

    // Clear local storage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
    }
  }

  /**
   * Get current user information
   */
  static async getCurrentUser(): Promise<User> {
    const response = await fetch(`${API_BASE_URL}${API_PREFIX}/auth/me`, {
      headers: {
        ...this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get current user');
    }

    return response.json();
  }

  /**
   * Get all users (admin only)
   */
  static async getAllUsers(): Promise<User[]> {
    const response = await fetch(`${API_BASE_URL}${API_PREFIX}/auth/users`, {
      headers: {
        ...this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get users');
    }

    return response.json();
  }

  /**
   * Confirm a user (admin only)
   */
  static async confirmUser(userId: string): Promise<User> {
    const response = await fetch(`${API_BASE_URL}${API_PREFIX}/auth/users/${userId}/confirm`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      throw new Error('Failed to confirm user');
    }

    return response.json();
  }

  /**
   * Get user permissions
   */
  static async getUserPermissions(userId: string): Promise<{ user_id: string; permissions: string[] }> {
    const response = await fetch(`${API_BASE_URL}${API_PREFIX}/auth/users/${userId}/permissions`, {
      headers: {
        ...this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get permissions');
    }

    return response.json();
  }

  /**
   * Check if user is authenticated
   */
  static isAuthenticated(): boolean {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('access_token');
  }

  /**
   * Get stored user from localStorage
   */
  static getStoredUser(): User | null {
    if (typeof window === 'undefined') return null;
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  /**
   * Get stored token
   */
  static getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('access_token');
  }

  /**
   * Request password reset
   */
  static async requestPasswordReset(email: string): Promise<{ message: string; reset_token?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}${API_PREFIX}/auth/password/reset-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Password reset request failed' }));
        const friendlyMessage = getUserFriendlyError(error, 'Failed to send password reset email.');
        throw new AuthError(friendlyMessage, response.status);
      }

      return response.json();
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new AuthError('Unable to connect to server. Please check your internet connection.');
      }
      throw new AuthError('An unexpected error occurred.');
    }
  }

  /**
   * Reset password with token
   */
  static async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}${API_PREFIX}/auth/password/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, new_password: newPassword }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Password reset failed' }));
        const friendlyMessage = getUserFriendlyError(error, 'Failed to reset password.');
        throw new AuthError(friendlyMessage, response.status);
      }

      return response.json();
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new AuthError('Unable to connect to server. Please check your internet connection.');
      }
      throw new AuthError('An unexpected error occurred.');
    }
  }

  /**
   * Change password (for authenticated users)
   */
  static async changePassword(oldPassword: string, newPassword: string): Promise<{ message: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}${API_PREFIX}/auth/password/change`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeader(),
        },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Password change failed' }));
        const friendlyMessage = getUserFriendlyError(error, 'Failed to change password.');
        throw new AuthError(friendlyMessage, response.status);
      }

      return response.json();
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new AuthError('Unable to connect to server. Please check your internet connection.');
      }
      throw new AuthError('An unexpected error occurred.');
    }
  }

  /**
   * Verify email with token
   */
  static async verifyEmail(token: string): Promise<{ message: string; verified: boolean }> {
    try {
      const response = await fetch(`${API_BASE_URL}${API_PREFIX}/auth/email/verify?token=${encodeURIComponent(token)}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Email verification failed' }));
        const friendlyMessage = getUserFriendlyError(error, 'Failed to verify email.');
        throw new AuthError(friendlyMessage, response.status);
      }

      return response.json();
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new AuthError('Unable to connect to server. Please check your internet connection.');
      }
      throw new AuthError('An unexpected error occurred.');
    }
  }

  /**
   * Resend verification email
   */
  static async resendVerificationEmail(email: string): Promise<{ message: string; verification_token?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}${API_PREFIX}/auth/email/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to resend verification email' }));
        const friendlyMessage = getUserFriendlyError(error, 'Failed to send verification email.');
        throw new AuthError(friendlyMessage, response.status);
      }

      return response.json();
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new AuthError('Unable to connect to server. Please check your internet connection.');
      }
      throw new AuthError('An unexpected error occurred.');
    }
  }
}
