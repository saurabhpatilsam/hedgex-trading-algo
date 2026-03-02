# Authentication Setup - Frontend Integration

This guide explains how the frontend communicates with the backend API for authentication.

## Architecture

```
┌─────────────┐         HTTP/JSON          ┌──────────────┐
│             │ ────────────────────────▶  │              │
│  Frontend   │                            │   Backend    │
│  (Next.js)  │                            │  (FastAPI)   │
│             │ ◀────────────────────────  │              │
└─────────────┘      JWT + User Data       └──────────────┘
                                                   │
                                                   │
                                                   ▼
                                            ┌──────────────┐
                                            │   Supabase   │
                                            │   Database   │
                                            └──────────────┘
```

**✅ Frontend:** No direct database access, all through API  
**✅ Backend:** Handles all authentication logic  
**✅ Database:** Users table with `confirmed` field  

---

## Quick Start

### 1. Environment Setup

Create `.env.local` in the `commander` directory:

```bash
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:8090

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Redis (for trading features)
REDIS_HOST=your_redis_host
REDIS_PORT=6380
REDIS_PRIMARY_ACCESS_KEY=your_key

# Price channels (existing)
PRICE_CHANNEL_1=TRADOVATE_MESZ5_PRICE:MESZ5:MESZ5
PRICE_CHANNEL_2=TRADOVATE_ESZ5_PRICE:ESZ5:ESZ5
PRICE_CHANNEL_3=TRADOVATE_MNQZ5_PRICE:MNQZ5:MNQZ5
PRICE_CHANNEL_4=TRADOVATE_NQZ5_PRICE:NQZ5:NQZ5
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Development Server

```bash
npm run dev
```

Frontend will run on `http://localhost:3000`

---

## How It Works

### Authentication Flow

#### 1. **Sign Up**
```
User fills form → Frontend calls /api/v1/auth/signup → Backend creates user with confirmed=false
→ User redirected to sign-in → Admin must confirm account
```

#### 2. **Sign In**
```
User enters credentials → Frontend calls /api/v1/auth/signin → Backend validates & checks confirmed=true
→ Backend returns JWT token → Frontend stores token in localStorage → User redirected to dashboard
```

#### 3. **Authenticated Requests**
```
Frontend includes JWT in headers → Backend validates token → Returns user data or error
```

#### 4. **Sign Out**
```
User clicks logout → Frontend calls /api/v1/auth/signout → Backend invalidates session
→ Frontend clears localStorage → User redirected to sign-in
```

---

## API Client Usage

### Import the API client

```typescript
import { AuthAPI } from '@/lib/api/auth-api';
```

### Sign Up
```typescript
const user = await AuthAPI.signup({
  email: 'user@example.com',
  password: 'password123',
  name: 'John Doe'
});
// User created but not confirmed
```

### Sign In
```typescript
const { access_token, user } = await AuthAPI.signin({
  email: 'user@example.com',
  password: 'password123'
});
// Token automatically stored in localStorage
```

### Get Current User
```typescript
const user = await AuthAPI.getCurrentUser();
```

### Sign Out
```typescript
await AuthAPI.signout();
// Clears localStorage automatically
```

### Check Authentication Status
```typescript
const isAuth = AuthAPI.isAuthenticated();
```

---

## React Hooks

### `useAuth` Hook

Get current user and authentication state:

```typescript
import { useAuth } from '@/hooks/useAuth';

function MyComponent() {
  const { user, isAuthenticated, isLoading, refreshUser } = useAuth();
  
  if (isLoading) return <div>Loading...</div>;
  if (!isAuthenticated) return <div>Please sign in</div>;
  
  return (
    <div>
      <p>Welcome {user?.name}!</p>
      <p>Email: {user?.email}</p>
      <p>Confirmed: {user?.confirmed ? 'Yes' : 'No'}</p>
    </div>
  );
}
```

### `usePermissions` Hook

Check user permissions:

```typescript
import { usePermissions } from '@/hooks/useAuth';

function AdminPanel() {
  const { permissions, hasPermission } = usePermissions();
  
  if (!hasPermission('admin')) {
    return <div>Access denied</div>;
  }
  
  return <div>Admin panel content...</div>;
}
```

---

## Protected Routes

The app automatically protects routes using the `useAuth` hook:

```typescript
// app/dashboard/page.tsx
'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/sign-in');
    }
  }, [isLoading, isAuthenticated, router]);
  
  if (isLoading) return <div>Loading...</div>;
  if (!isAuthenticated) return null;
  
  return <div>Dashboard content</div>;
}
```

---

## User Confirmation Workflow

### For Administrators

1. **View Pending Users:**
   ```typescript
   const users = await AuthAPI.getAllUsers();
   const pending = users.filter(u => !u.confirmed);
   ```

2. **Confirm a User:**
   ```typescript
   await AuthAPI.confirmUser(userId);
   ```

3. **Example Admin Component:**
   ```typescript
   function UserApproval() {
     const [users, setUsers] = useState([]);
     
     useEffect(() => {
       loadUsers();
     }, []);
     
     async function loadUsers() {
       const allUsers = await AuthAPI.getAllUsers();
       setUsers(allUsers.filter(u => !u.confirmed));
     }
     
     async function confirmUser(userId: string) {
       try {
         await AuthAPI.confirmUser(userId);
         toast.success('User confirmed!');
         loadUsers(); // Refresh list
       } catch (error) {
         toast.error('Failed to confirm user');
       }
     }
     
     return (
       <div>
         {users.map(user => (
           <div key={user.id}>
             <p>{user.email} - {user.name}</p>
             <button onClick={() => confirmUser(user.id)}>
               Confirm
             </button>
           </div>
         ))}
       </div>
     );
   }
   ```

---

## Security Features

### ✅ Token Storage
- JWT tokens stored in **localStorage** (client-side)
- Automatically included in authenticated requests
- Cleared on logout or token expiration

### ✅ Token Validation
- Every authenticated request validated by backend
- Expired tokens rejected with 401 error
- Frontend automatically redirects to login

### ✅ User Confirmation
- New signups require admin approval
- Users with `confirmed=false` cannot login
- Prevents unauthorized access

### ✅ No Direct Database Access
- Frontend has **ZERO** direct database access
- All data flows through backend API
- Backend enforces all security rules

---

## Error Handling

The AuthAPI throws errors that you can catch:

```typescript
try {
  await AuthAPI.signin({ email, password });
  toast.success('Signed in!');
  router.push('/dashboard');
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes('not confirmed')) {
      toast.error('Account pending admin approval');
    } else if (error.message.includes('Invalid')) {
      toast.error('Invalid email or password');
    } else {
      toast.error(error.message);
    }
  }
}
```

---

## Common Issues

### Token Expired
**Symptom:** Redirected to login unexpectedly  
**Solution:** User needs to sign in again (24hr token expiration)

### Account Not Confirmed
**Symptom:** "Account not confirmed" error on login  
**Solution:** Admin must confirm user via backend API

### CORS Errors
**Symptom:** Network errors from frontend  
**Solution:** Ensure backend CORS allows `http://localhost:3000`

### Backend Not Running
**Symptom:** "Failed to fetch" errors  
**Solution:** Start backend: `cd orca-backend && poetry run python -m app.server`

---

## API Endpoints Reference

| Endpoint | Method | Auth Required | Description |
|----------|--------|---------------|-------------|
| `/api/v1/auth/signup` | POST | No | Create new user account |
| `/api/v1/auth/signin` | POST | No | Login and get JWT token |
| `/api/v1/auth/signout` | POST | Yes | Invalidate session |
| `/api/v1/auth/me` | GET | Yes | Get current user info |
| `/api/v1/auth/users` | GET | Yes | Get all users (admin) |
| `/api/v1/auth/users/{id}/confirm` | POST | Yes | Confirm user (admin) |
| `/api/v1/auth/users/{id}/permissions` | GET | Yes | Get user permissions |

---

## Testing Authentication

### Manual Testing

1. **Sign Up:**
   - Go to `http://localhost:3000/sign-up`
   - Create account
   - Should redirect to sign-in with message

2. **Try to Sign In (Should Fail):**
   - Try logging in with new account
   - Should see "Account not confirmed" error

3. **Confirm User (Backend):**
   ```bash
   curl -X POST http://localhost:8090/api/v1/auth/users/USER_ID/confirm \
     -H "Authorization: Bearer ADMIN_TOKEN"
   ```

4. **Sign In (Should Work):**
   - Login with confirmed account
   - Should redirect to dashboard

5. **Access Protected Route:**
   - Go to `/dashboard`
   - Should see trading dashboard

6. **Sign Out:**
   - Click logout button
   - Should redirect to sign-in

---

## Next Steps

1. ✅ Configure `.env.local` with backend URL
2. ✅ Start frontend: `npm run dev`
3. ✅ Ensure backend is running on port 8090
4. ✅ Test signup → confirm → signin flow
5. 🎯 Build admin user management UI
6. 🎯 Add password reset functionality
7. 🎯 Implement role-based access control

---

## Related Documentation

- **Backend Setup:** See `orca-backend/AUTH_SETUP_README.md`
- **Database Schema:** See `orca-backend/auth_schema.sql`
- **API Reference:** Visit `http://localhost:8090/docs` when backend is running

---

**Questions?** Check the backend API documentation at `/docs` or review the `AuthAPI` client code in `lib/api/auth-api.ts`.
