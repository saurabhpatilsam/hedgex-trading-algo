# Backend API Migration Guide

## Overview
The frontend has been updated to use a **single API prefix** (`/api/v1`) for all backend calls. You need to update your Python backend to match this structure.

## What Changed in Frontend

All Next.js API routes now call backend endpoints with `/api/v1` prefix:

```typescript
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8000';
const API_V1_PREFIX = '/api/v1';

// All calls now use:
`${BACKEND_API_URL}${API_V1_PREFIX}/...`
```

## Required Backend Changes

### 1. Move Bot Management Routes Under `/api/v1`

Your `bot_router` should be updated from:
```python
# OLD
bot_router = APIRouter(prefix="/api/bots", tags=["Bot Management"])
```

To:
```python
# NEW
bot_router = APIRouter(prefix="/api/v1/bots", tags=["Bot Management"])
```

### 2. Endpoints That Need Migration

The following endpoints need to be moved under `/api/v1`:

#### Bot Management Endpoints:
- ✅ `/api/bots/archived` → `/api/v1/bots/archived`
- ✅ `/api/bots/{bot_id}` (DELETE) → `/api/v1/bots/{bot_id}`
- ✅ `/api/bots/{bot_id}/archive` → `/api/v1/bots/{bot_id}/archive`
- ✅ `/api/bots/{bot_id}/unarchive` → `/api/v1/bots/{bot_id}/unarchive`
- ✅ `/api/bots/restart` → `/api/v1/bots/restart`

#### Run Configuration Endpoints (Already at `/api/v1`):
- ✅ `/api/v1/run-bot/configs`
- ✅ `/api/v1/run-bot/configs/active`
- ✅ `/api/v1/run-bot/configs/{botId}/status`
- ✅ `/api/v1/run-bot/max`

### 3. Route Ordering (IMPORTANT!)

Keep static routes BEFORE parametric routes:

```python
# ✅ CORRECT ORDER
@bot_router.get("/archived", ...)           # Static
@bot_router.get("/health/check", ...)       # Static
@bot_router.get("/configurations/list", ...)# Static
@bot_router.get("/{bot_id}", ...)          # Parametric (LAST)

# ❌ WRONG ORDER (causes 404s)
@bot_router.get("/{bot_id}", ...)          # Catches everything!
@bot_router.get("/archived", ...)          # Never reached!
```

### 4. Example Migration

**Before:**
```python
bot_router = APIRouter(prefix="/api/bots", tags=["Bot Management"])

@bot_router.get("/archived")
async def get_archived_bots(...):
    # Called at: http://0.0.0.0:8000/api/bots/archived
    ...
```

**After:**
```python
bot_router = APIRouter(prefix="/api/v1/bots", tags=["Bot Management"])

@bot_router.get("/archived")
async def get_archived_bots(...):
    # Called at: http://0.0.0.0:8000/api/v1/bots/archived
    ...
```

### 5. Main App Registration

Update your main FastAPI app to include the router properly:

```python
from app.api.bot_router import bot_router

app = FastAPI()

# Include the bot router (prefix is already in the router definition)
app.include_router(bot_router)
```

## Testing After Migration

Test each endpoint with curl:

```bash
# Get archived bots
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://0.0.0.0:8000/api/v1/bots/archived

# Archive a bot
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "manual", "archived_by": "user"}' \
  http://0.0.0.0:8000/api/v1/bots/28/archive

# Delete a bot
curl -X DELETE \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://0.0.0.0:8000/api/v1/bots/28?permanent=true
```

## Verification Checklist

- [ ] Bot router prefix changed to `/api/v1/bots`
- [ ] All bot management endpoints accessible at `/api/v1/bots/*`
- [ ] Run configuration endpoints remain at `/api/v1/run-bot/*`
- [ ] Static routes are ordered BEFORE parametric routes
- [ ] Backend server restarted after changes
- [ ] All endpoints return 200 (not 404) when tested

## Frontend Endpoints Summary

All frontend Next.js API routes now call:

| Frontend Route | Backend Endpoint |
|----------------|------------------|
| `GET /api/bots` | `http://0.0.0.0:8000/api/v1/run-bot/configs` |
| `GET /api/bots/archived` | `http://0.0.0.0:8000/api/v1/bots/archived` |
| `DELETE /api/bots/[id]` | `http://0.0.0.0:8000/api/v1/bots/{id}` |
| `POST /api/bots/[id]/archive` | `http://0.0.0.0:8000/api/v1/bots/{id}/archive` |
| `POST /api/bots/[id]/unarchive` | `http://0.0.0.0:8000/api/v1/bots/{id}/unarchive` |
| `POST /api/bots/restart` | `http://0.0.0.0:8000/api/v1/bots/restart` |
| `POST /api/bots/create/orcamax` | `http://0.0.0.0:8000/api/v1/run-bot/max` |
| `PATCH /api/bots/[id]/status` | `http://0.0.0.0:8000/api/v1/run-bot/configs/{id}/status` |

## Notes

- The `/api/v1` prefix provides API versioning
- All endpoints are now consistent and easier to maintain
- This structure follows REST API best practices
