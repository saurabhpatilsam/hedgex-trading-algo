# 🚀 Quick Start: Better-Auth + Supabase

Follow these steps to get authentication working in 5 minutes.

## ✅ Quick Setup Checklist

### 1. Get Supabase Credentials (2 min)

- [ ] Go to [Supabase Dashboard](https://supabase.com/dashboard)
- [ ] Copy your **Database URL** from Settings → Database → Connection String (Session mode)
- [ ] Get **Access Token** from [Account Tokens](https://supabase.com/dashboard/account/tokens)

### 2. Configure Environment (1 min)

Create/update `.env.local`:

```bash
# Copy from your Supabase project
DATABASE_URL=postgresql://postgres.[REF]:[PASSWORD]@....pooler.supabase.com:6543/postgres

# Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=your_random_secret_here

# Your app URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# For MCP user management
SUPABASE_ACCESS_TOKEN=your_token_here
```

### 3. Run Migrations (1 min)

```bash
npm install
npx @better-auth/cli migrate
```

### 4. Test It! (1 min)

```bash
npm run dev
```

Visit: `http://localhost:3000/sign-up`

---

## 🎯 What You Get

✅ **Email/Password Authentication**  
✅ **Multi-Tenancy with Organizations**  
✅ **Sign-up page** at `/sign-up`  
✅ **Sign-in page** at `/sign-in`  
✅ **User management via Supabase**  
✅ **MCP integration** for automation  
✅ **No more Kinde dependency**

---

## 📱 Using in Your Code

### Check if user is logged in

```typescript
import { useAuth } from '@/hooks/useAuth';

function MyComponent() {
  const { user, isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) return <div>Loading...</div>;
  if (!isAuthenticated) return <div>Please sign in</div>;
  
  return <div>Welcome {user?.name}!</div>;
}
```

### Sign up a user

```typescript
import { signUp } from '@/lib/auth-client';

await signUp.email({
  email: 'user@example.com',
  password: 'securepassword',
  name: 'John Doe',
});
```

### Sign in

```typescript
import { signIn } from '@/lib/auth-client';

await signIn.email({
  email: 'user@example.com',
  password: 'securepassword',
});
```

### Sign out

```typescript
import { signOut } from '@/lib/auth-client';

await signOut();
```

### Create an organization

```typescript
import { organization } from '@/lib/auth-client';

await organization.create({
  name: 'My Trading Firm',
  slug: 'my-trading-firm',
});
```

---

## 🔧 MCP Configuration

Your MCP config (`mcp-config-better-auth.json`) includes:

- **better-auth MCP server** - Manage authentication
- **supabase MCP server** - Direct database access

Both read from your `.env.local` file automatically.

---

## 🆘 Common Issues

**Database connection error?**
- Check your DATABASE_URL has the correct password
- Ensure you're using the "Session mode" connection string

**Migrations fail?**
- Run `npm install pg` to ensure PostgreSQL driver is installed
- Verify database connectivity

**Not redirecting after login?**
- Clear browser cookies
- Check BETTER_AUTH_SECRET is set

---

## 📖 Full Documentation

See `SUPABASE_SETUP_GUIDE.md` for complete setup instructions and advanced features.

---

**You're all set! 🎉**
