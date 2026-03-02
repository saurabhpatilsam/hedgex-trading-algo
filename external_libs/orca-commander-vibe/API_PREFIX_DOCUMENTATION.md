# API Prefix Documentation

## Overview
This document outlines the consistent API prefix pattern used across all Next.js API routes when calling the backend Python FastAPI service.

## Configuration

**All API routes use a single prefix:**

```typescript
// Backend API URL - configured via environment variable
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8000';
const API_V1_PREFIX = '/api/v1';
```

## Environment Variable

Set in `.env.local`:
```bash
BACKEND_API_URL=http://0.0.0.0:8000
```

## Endpoint Mapping

**All endpoints now use `/api/v1` prefix:**

| Next.js Route | Backend Endpoint | Method |
|--------------|------------------|--------|
| `/api/bots` | `${BACKEND_API_URL}/api/v1/run-bot/configs` | GET |
| `/api/bots/archived` | `${BACKEND_API_URL}/api/v1/bots/archived` | GET |
| `/api/bots/[botId]` | `${BACKEND_API_URL}/api/v1/bots/{botId}` | DELETE |
| `/api/bots/[botId]/archive` | `${BACKEND_API_URL}/api/v1/bots/{botId}/archive` | POST |
| `/api/bots/[botId]/unarchive` | `${BACKEND_API_URL}/api/v1/bots/{botId}/unarchive` | POST |
| `/api/bots/[botId]/status` | `${BACKEND_API_URL}/api/v1/run-bot/configs/{botId}/status` | PATCH |
| `/api/bots/restart` | `${BACKEND_API_URL}/api/v1/bots/restart` | POST |
| `/api/bots/create/orcamax` | `${BACKEND_API_URL}/api/v1/run-bot/max` | POST |
| `/api/run-configs` | `${BACKEND_API_URL}/api/v1/run-bot/configs` | GET |
| `/api/run-configs/active` | `${BACKEND_API_URL}/api/v1/run-bot/configs/active` | GET |

## Usage Example

```typescript
// All endpoints use the same prefix pattern
const backendUrl = `${BACKEND_API_URL}${API_V1_PREFIX}/bots/${botId}/archive`;
const backendUrl = `${BACKEND_API_URL}${API_V1_PREFIX}/run-bot/configs`;
const backendUrl = `${BACKEND_API_URL}${API_V1_PREFIX}/bots/archived`;
```

## Important Notes

1. **Never use direct backend URLs in React components** - Always call through Next.js API routes
2. **Server-side only** - These environment variables are not accessible in client-side code
3. **Single prefix** - All backend API calls use `/api/v1` prefix
4. **Authentication** - Always forward the Authorization header from the client request to the backend

## Backend API Structure

The Python FastAPI backend uses a single versioned API prefix:
- `/api/v1/bots/*` - Bot management operations (archive, delete, restart, unarchive, etc.)
- `/api/v1/run-bot/*` - Run configuration operations (create, status, configs)

## Troubleshooting

If you get 404 errors:
1. Check that the backend server is running on port 8000
2. Verify BACKEND_API_URL in `.env.local`
3. Ensure route ordering in FastAPI (static routes before parametric)
4. Check that the API prefix matches the backend route definition
