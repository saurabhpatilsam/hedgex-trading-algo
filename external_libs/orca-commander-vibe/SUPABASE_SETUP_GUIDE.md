# Supabase + Better-Auth Setup Guide

This guide will help you complete the integration of **Better-Auth** with **Supabase** for multi-tenancy authentication in your Orca Trading Dashboard.

## 🎯 What's Been Configured

✅ **Better-Auth with MCP Plugin** - Added to `/lib/auth.ts`  
✅ **Organization Plugin** - Multi-tenancy support enabled  
✅ **Sign-up & Sign-in Pages** - Ready at `/sign-up` and `/sign-in`  
✅ **MCP Configuration** - Both Better-Auth and Supabase MCP servers configured  
✅ **Kinde Removed** - All Kinde references replaced with Better-Auth  

---

## 📋 Prerequisites

Before you begin, make sure you have:

1. **Node.js 18+** installed
2. **A Supabase account** - [Sign up here](https://supabase.com)
3. **Supabase Access Token** - For MCP integration

---

## 🚀 Step 1: Create/Configure Supabase Project

### Option A: Create New Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click **"New Project"**
3. Fill in:
   - **Name**: `orca-trading-app` (or your preferred name)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose closest to your users
4. Click **"Create new project"** (takes ~2 minutes)

### Option B: Use Existing Project

1. Navigate to your existing project in Supabase Dashboard
2. Note your project name and ensure you have the database password

---

## 🔑 Step 2: Get Your Supabase Credentials

### Database URL

1. In Supabase Dashboard, go to **Settings** → **Database**
2. Find **Connection String** section
3. Select **Connection Pooling** → **Session mode**
4. Copy the URI (should look like):
   ```
   postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with your actual database password

### Supabase Access Token

1. Go to [Supabase Account Tokens](https://supabase.com/dashboard/account/tokens)
2. Click **"Generate new token"**
3. Give it a name like `Orca MCP Access`
4. Copy the token (you won't see it again!)

---

## ⚙️ Step 3: Configure Environment Variables

Update your `.env.local` file:

```bash
# ==================================
# BETTER-AUTH CONFIGURATION
# ==================================

# Database URL from Supabase (from Step 2)
DATABASE_URL=postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres

# Generate a secret key with: openssl rand -base64 32
BETTER_AUTH_SECRET=your_generated_secret_here

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ==================================
# SUPABASE MCP (for user management)
# ==================================

# Access token from Step 2
SUPABASE_ACCESS_TOKEN=your_supabase_access_token_here

# ==================================
# REDIS CONFIGURATION (existing)
# ==================================

REDIS_HOST=redismanager.redis.cache.windows.net
REDIS_PORT=6380
REDIS_PRIMARY_ACCESS_KEY=your_redis_access_key

# Price channels (existing)
PRICE_CHANNEL_1=TRADOVATE_MESZ5_PRICE:MESZ5:MESZ5
PRICE_CHANNEL_2=TRADOVATE_ESZ5_PRICE:ESZ5:ESZ5
PRICE_CHANNEL_3=TRADOVATE_MNQZ5_PRICE:MNQZ5:MNQZ5
PRICE_CHANNEL_4=TRADOVATE_NQZ5_PRICE:NQZ5:NQZ5
```

### Generate BETTER_AUTH_SECRET

Run this command in your terminal:
```bash
openssl rand -base64 32
```

Copy the output and paste it as your `BETTER_AUTH_SECRET`.

---

## 🗄️ Step 4: Run Database Migrations

Install dependencies and run migrations:

```bash
# Install dependencies (if not already done)
npm install

# Run Better-Auth migrations to create database tables
npx @better-auth/cli migrate
```

This creates the following tables in your Supabase database:
- `user` - User accounts
- `session` - Active user sessions
- `account` - OAuth provider accounts
- `verification` - Email verification tokens
- `organization` - Organizations (multi-tenancy)
- `member` - Organization members and roles
- `invitation` - Organization invitations

---

## ✅ Step 5: Verify Setup

1. **Start your development server:**
   ```bash
   npm run dev
   ```

2. **Test Sign-up:**
   - Navigate to `http://localhost:3000/sign-up`
   - Create a new account with email/password
   - You should be redirected to the dashboard

3. **Check Supabase Database:**
   - Go to Supabase Dashboard → **Table Editor**
   - Check the `user` table - your new user should appear

4. **Test Sign-in:**
   - Sign out from the dashboard
   - Go to `/sign-in`
   - Login with your credentials

---

## 🏢 Step 6: Using Multi-Tenancy (Organizations)

### Create an Organization

In your application code:

```typescript
import { organization } from '@/lib/auth-client';

// Create organization
await organization.create({
  name: 'Acme Trading LLC',
  slug: 'acme-trading',
});
```

### Invite Members

```typescript
await organization.inviteMember({
  email: 'trader@example.com',
  role: 'member', // or 'owner'
});
```

### Get Active Organization

```typescript
import { useAuth } from '@/hooks/useAuth';

function MyComponent() {
  const { organization, user } = useAuth();
  
  return (
    <div>
      <p>User: {user?.name}</p>
      <p>Organization: {organization?.name}</p>
    </div>
  );
}
```

---

## 🔧 MCP Integration

The MCP configuration in `mcp-config-better-auth.json` includes:

### Better-Auth MCP Server
Manages authentication operations via MCP tools

### Supabase MCP Server
Direct database access and management via MCP

To use Supabase MCP tools, ensure `SUPABASE_ACCESS_TOKEN` is set in your environment.

---

## 🎨 Customization

### Add Social Login (GitHub, Google, etc.)

1. Get OAuth credentials from the provider
2. Add to `.env.local`:
   ```bash
   GITHUB_CLIENT_ID=your_github_client_id
   GITHUB_CLIENT_SECRET=your_github_client_secret
   ```

3. Uncomment in `/lib/auth.ts`:
   ```typescript
   socialProviders: {
     github: {
       clientId: process.env.GITHUB_CLIENT_ID!,
       clientSecret: process.env.GITHUB_CLIENT_SECRET!,
     },
   },
   ```

### Enable Email Verification

In `/lib/auth.ts`:
```typescript
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true, // Change to true
},
```

---

## 🐛 Troubleshooting

### "Unauthorized" error with MCP
- Verify `SUPABASE_ACCESS_TOKEN` is set correctly
- Regenerate token if needed

### Database connection fails
- Check `DATABASE_URL` is correct
- Verify password is URL-encoded if it contains special characters
- Ensure IP is whitelisted (or disable IP restrictions for dev)

### Sessions not persisting
- Clear browser cookies
- Verify `BETTER_AUTH_SECRET` is set
- Check browser developer tools for cookie errors

### Migration fails
- Ensure `pg` package is installed: `npm install pg`
- Check database connection before running migrations
- View Supabase logs in Dashboard → **Logs**

---

## 📚 Resources

- [Better Auth Documentation](https://www.better-auth.com)
- [Better Auth Organization Plugin](https://www.better-auth.com/docs/plugins/organization)
- [Better Auth MCP Plugin](https://www.better-auth.com/docs/plugins/mcp)
- [Supabase Documentation](https://supabase.com/docs)
- [Supabase MCP Server](https://github.com/supabase/mcp-server)

---

## 🎉 Next Steps

1. ✅ Complete environment variable setup
2. ✅ Run database migrations
3. ✅ Test sign-up and sign-in flows
4. 🎯 Create your first organization
5. 🎯 Invite team members
6. 🎯 Implement role-based access control
7. 🎯 Configure social login providers (optional)

---

## 📝 Migration Notes

### What Changed from Kinde

- ❌ Removed `@kinde-oss/kinde-auth-nextjs` package
- ✅ Added better-auth with organization support
- ✅ Updated all auth hooks to use `useAuth()`
- ✅ Sign-in page: `/sign-in` (was `/login`)
- ✅ Sign-up page: `/sign-up`
- ✅ All user data now in Supabase (full control)

### Database Structure

Better-auth creates a clean, normalized schema in your Supabase database. All tables are prefixed to avoid conflicts and follow best practices for security and performance.

---

Need help? Check the resources above or review the `BETTER_AUTH_SETUP.md` file for additional details.
