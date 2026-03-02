# Authentication Implementation Guide

## Overview

The application now has proper authentication protection implemented. Users cannot access the dashboard without being authenticated (unless auth is explicitly disabled).

---

## How Authentication Works

### 1. **Authentication Flow**

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Sign In Page   │ ──────► Backend API (POST /api/v1/auth/signin)
└────────┬────────┘
         │
         ▼
    ┌────────────┐
    │ JWT Token  │ ──────► Stored in localStorage
    └─────┬──────┘
          │
          ▼
    ┌──────────────┐
    │  Dashboard   │ ──────► Protected by AuthGuard
    └──────────────┘
```

### 2. **Key Components**

#### **AuthGuard Component** (`components/auth-guard.tsx`)
- Wraps protected routes
- Checks authentication status using `useAuth` hook
- Redirects to `/sign-in` if not authenticated
- Shows loading state while checking auth
- Respects `NEXT_PUBLIC_DISABLE_AUTH` environment variable

#### **useAuth Hook** (`hooks/useAuth.ts`)
- Manages authentication state
- Checks for JWT token in localStorage
- Validates token with backend API
- Provides `isAuthenticated`, `isLoading`, and `user` states

#### **AuthAPI** (`lib/api/auth-api.ts`)
- Handles all authentication API calls
- Methods:
  - `signin()` - Sign in with email/password
  - `signup()` - Register new user
  - `signout()` - Sign out and clear tokens
  - `getCurrentUser()` - Get current user info
  - `isAuthenticated()` - Check if token exists

#### **Middleware** (`middleware.ts`)
- Server-side route protection (backup layer)
- Checks `NEXT_PUBLIC_DISABLE_AUTH` flag
- Defines public and protected routes

---

## Protected Routes

The following routes are now protected and require authentication:

- ✅ `/dashboard` - Main dashboard
- ✅ `/dashboard/*` - All dashboard sub-routes

### Public Routes (No Auth Required)

- `/` - Home page (redirects based on auth status)
- `/sign-in` - Sign in page
- `/sign-up` - Sign up page
- `/login` - Login page

---

## Usage

### Protecting a New Route

To protect any new route, simply wrap it with the `AuthGuard` component:

```tsx
'use client';

import { AuthGuard } from '@/components/auth-guard';

export default function MyProtectedPage() {
  return (
    <AuthGuard>
      <div>
        {/* Your protected content here */}
      </div>
    </AuthGuard>
  );
}
```

### Custom Redirect

You can specify a custom redirect URL:

```tsx
<AuthGuard redirectTo="/custom-login">
  {/* Protected content */}
</AuthGuard>
```

---

## Environment Variables

### Disabling Authentication (Development Only)

For development/testing, you can disable authentication:

```bash
# .env.local
NEXT_PUBLIC_DISABLE_AUTH=true
```

⚠️ **Warning**: Never set this to `true` in production!

### Backend API Configuration

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:8090
```

---

## Authentication States

### 1. **Not Authenticated**
- User is redirected to `/sign-in`
- Dashboard is not accessible
- Token doesn't exist or is invalid

### 2. **Loading**
- Checking authentication status
- Shows loading spinner
- Prevents flash of unauthenticated content

### 3. **Authenticated**
- User can access protected routes
- Valid JWT token exists
- User data is available

---

## Token Storage

Tokens are stored in **localStorage**:

```javascript
// Token
localStorage.getItem('access_token')

// User data
localStorage.getItem('user')
```

### Why localStorage?

- Simple client-side storage
- Persists across page refreshes
- Easy to access from client components

### Security Considerations

⚠️ **Important**: 
- Tokens in localStorage are vulnerable to XSS attacks
- Always sanitize user input
- Use HTTPS in production
- Consider using httpOnly cookies for production

---

## API Endpoints

The authentication system communicates with these backend endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/auth/signup` | POST | Register new user |
| `/api/v1/auth/signin` | POST | Sign in user |
| `/api/v1/auth/signout` | POST | Sign out user |
| `/api/v1/auth/me` | GET | Get current user |
| `/api/v1/auth/users` | GET | Get all users (admin) |
| `/api/v1/auth/users/:id/confirm` | POST | Confirm user (admin) |
| `/api/v1/auth/users/:id/permissions` | GET | Get user permissions |

---

## Testing Authentication

### 1. **Test Protected Route Access**

```bash
# Without authentication
1. Clear localStorage
2. Navigate to http://localhost:3000/dashboard
3. Should redirect to /sign-in
```

### 2. **Test Sign In Flow**

```bash
1. Go to /sign-in
2. Enter credentials
3. Click "Sign In"
4. Should redirect to /dashboard
5. Token should be in localStorage
```

### 3. **Test Sign Out**

```bash
1. While logged in, click "Logout"
2. Should redirect to /sign-in
3. localStorage should be cleared
4. Accessing /dashboard should redirect to /sign-in
```

---

## Common Issues & Solutions

### Issue: Dashboard is accessible without login

**Solution**: 
1. Check that `NEXT_PUBLIC_DISABLE_AUTH` is NOT set to `true`
2. Clear browser cache and localStorage
3. Restart the dev server

### Issue: Infinite redirect loop

**Solution**:
1. Check that sign-in page is in the public routes list
2. Verify token validation is working
3. Check browser console for errors

### Issue: "Verifying authentication..." stuck

**Solution**:
1. Check backend API is running
2. Verify `NEXT_PUBLIC_API_URL` is correct
3. Check network tab for failed requests
4. Ensure CORS is configured on backend

---

## Code Examples

### Using Authentication in Components

```tsx
'use client';

import { useAuth } from '@/hooks/useAuth';

export function MyComponent() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <div>Please sign in</div>;
  }

  return (
    <div>
      <h1>Welcome, {user?.name}!</h1>
      <p>Email: {user?.email}</p>
    </div>
  );
}
```

### Checking Permissions

```tsx
import { usePermissions } from '@/hooks/useAuth';

export function AdminPanel() {
  const { hasPermission, permissionsLoading } = usePermissions();

  if (permissionsLoading) {
    return <div>Loading permissions...</div>;
  }

  if (!hasPermission('admin')) {
    return <div>Access denied</div>;
  }

  return <div>Admin Panel</div>;
}
```

---

## Production Deployment

### Checklist

- [ ] Set `NEXT_PUBLIC_DISABLE_AUTH=false` (or remove it)
- [ ] Configure `NEXT_PUBLIC_API_URL` to production backend
- [ ] Enable HTTPS
- [ ] Configure CORS on backend
- [ ] Set up proper error logging
- [ ] Test all authentication flows
- [ ] Consider implementing refresh tokens
- [ ] Add rate limiting to auth endpoints

---

## Security Best Practices

1. ✅ **Never commit tokens** - Use environment variables
2. ✅ **Validate on server** - Don't trust client-side checks alone
3. ✅ **Use HTTPS** - Always in production
4. ✅ **Implement token expiry** - Tokens should expire
5. ✅ **Sanitize inputs** - Prevent XSS attacks
6. ✅ **Rate limit auth endpoints** - Prevent brute force
7. ✅ **Log auth events** - Monitor suspicious activity

---

## Summary

✅ **Authentication is now properly implemented**
- Dashboard requires authentication
- AuthGuard component protects routes
- Proper loading and redirect states
- Can be disabled for development
- Works with your existing backend API

The dashboard is no longer accessible without authentication! 🔒
