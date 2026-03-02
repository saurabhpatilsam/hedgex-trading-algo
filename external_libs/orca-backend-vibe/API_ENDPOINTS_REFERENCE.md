# Complete API Endpoints Reference

## 📋 **Base URLs**

- **API v1**: `/api/v1/`
- **Bot Management**: `/api/bots/` (no version prefix)
- **Health**: `/health`

---

## 🔐 **Authentication Endpoints**

All auth endpoints are under `/api/v1/auth/`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/auth/signup` | Register new user | No |
| POST | `/api/v1/auth/signin` | Login user | No |
| POST | `/api/v1/auth/signout` | Logout user | Yes |
| GET | `/api/v1/auth/me` | Get current user | Yes |
| POST | `/api/v1/auth/refresh` | Refresh token | Yes |
| GET | `/api/v1/auth/health` | Auth service health | No |

---

## 🤖 **Bot Management Endpoints**

All bot endpoints are under `/api/bots/` (NOT `/api/v1/bots/`)

### **List & Details**

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/bots/` | List all bots | Yes |
| GET | `/api/bots/{bot_id}` | Get bot details | Yes |
| GET | `/api/bots/{bot_id}/actions` | Get bot action history | Yes |
| GET | `/api/bots/{bot_id}/metrics` | Get bot metrics | Yes |

### **Control Actions**

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/bots/{bot_id}/pause` | Pause a running bot | Yes |
| POST | `/api/bots/{bot_id}/resume` | Resume a paused bot | Yes |
| POST | `/api/bots/{bot_id}/stop` | Stop a bot permanently | Yes |
| POST | `/api/bots/{bot_id}/clear` | Clear orders/positions | Yes |

### **Health**

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/bots/health/check` | Bot system health | No |

---

## 🚀 **Bot Execution Endpoints**

All execution endpoints are under `/api/v1/run-bot/`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/run-bot/max` | Start a new trading bot | Yes |
| POST | `/api/v1/run-bot/max-backtest` | Run backtest | Yes |
| GET | `/api/v1/run-bot/configs` | List all run configs | Yes |
| GET | `/api/v1/run-bot/configs/{run_id}` | Get run config details | Yes |

---

## 🏥 **Health Check Endpoints**

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/health` | Overall system health | No |
| GET | `/api/v1/auth/health` | Auth service health | No |
| GET | `/api/bots/health/check` | Bot management health | No |

---

## 📊 **Complete Endpoint Summary**

```
Root
├── /                           → Root info
├── /health                     → System health
├── /docs                       → Swagger UI
├── /redoc                      → ReDoc UI
│
├── /api/v1/auth/               → Authentication
│   ├── /signup                 → Register
│   ├── /signin                 → Login
│   ├── /signout                → Logout
│   ├── /me                     → Current user
│   ├── /refresh                → Refresh token
│   └── /health                 → Auth health
│
├── /api/v1/run-bot/            → Bot Execution
│   ├── /max                    → Start bot
│   ├── /max-backtest           → Backtest
│   ├── /configs                → List configs
│   └── /configs/{id}           → Config details
│
└── /api/bots/                  → Bot Management (NO /v1/)
    ├── /                       → List bots
    ├── /{bot_id}               → Bot details
    ├── /{bot_id}/pause         → Pause bot
    ├── /{bot_id}/resume        → Resume bot
    ├── /{bot_id}/stop          → Stop bot
    ├── /{bot_id}/clear         → Clear orders
    ├── /{bot_id}/actions       → Action history
    ├── /{bot_id}/metrics       → Metrics
    └── /health/check           → Bot health
```

---

## 🎯 **Important Notes**

### **URL Conventions**

1. ✅ **Auth & Execution**: Use `/api/v1/` prefix
   - Example: `GET /api/v1/auth/me`
   - Example: `POST /api/v1/run-bot/max`

2. ✅ **Bot Management**: Use `/api/bots/` (NO v1)
   - Example: `GET /api/bots/`
   - Example: `POST /api/bots/{bot_id}/pause`

3. ✅ **Health Checks**: No version prefix
   - Example: `GET /health`

### **Why Different Prefixes?**

- `/api/v1/` - Versioned APIs for stability
- `/api/bots/` - Bot management is a separate service domain
- `/health` - Universal health check standard

---

## 🔧 **Frontend Configuration**

```typescript
// API Configuration
const API_BASE_URL = 'http://localhost:8000';

// Different base paths for different services
const ENDPOINTS = {
  // Auth & Bot Execution (with /v1/)
  auth: `${API_BASE_URL}/api/v1/auth`,
  botExecution: `${API_BASE_URL}/api/v1/run-bot`,
  
  // Bot Management (NO /v1/)
  botManagement: `${API_BASE_URL}/api/bots`,
  
  // Health
  health: `${API_BASE_URL}/health`
};

// Examples
axios.get(`${ENDPOINTS.auth}/me`);                          // ✅ /api/v1/auth/me
axios.post(`${ENDPOINTS.botExecution}/max`, config);        // ✅ /api/v1/run-bot/max
axios.get(`${ENDPOINTS.botManagement}/`);                   // ✅ /api/bots/
axios.post(`${ENDPOINTS.botManagement}/${botId}/pause`);    // ✅ /api/bots/{id}/pause
```

---

## 📝 **Testing Examples**

### **1. Start a Bot**
```bash
curl -X POST 'http://localhost:8000/api/v1/run-bot/max' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "accountName": "APEX",
    "contract": "NQ",
    "way": "long",
    "environment": "PROD"
  }'
```

### **2. List All Bots**
```bash
curl -X GET 'http://localhost:8000/api/bots/' \
  -H 'Authorization: Bearer TOKEN'
```

### **3. Get Bot Details**
```bash
curl -X GET 'http://localhost:8000/api/bots/orca_max_20_abc123' \
  -H 'Authorization: Bearer TOKEN'
```

### **4. Pause a Bot**
```bash
curl -X POST 'http://localhost:8000/api/bots/orca_max_20_abc123/pause' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"performed_by": "user@example.com"}'
```

### **5. Check Health**
```bash
# System health
curl http://localhost:8000/health

# Bot management health
curl http://localhost:8000/api/bots/health/check

# Auth health
curl http://localhost:8000/api/v1/auth/health
```

---

## 🚨 **Common Mistakes**

### ❌ **Wrong: Using /api/v1/bots/**
```javascript
// WRONG - This will return 404
axios.get('/api/v1/bots/');
```

### ✅ **Correct: Using /api/bots/**
```javascript
// CORRECT
axios.get('/api/bots/');
```

---

## 🔍 **Troubleshooting**

### **Getting 404 on bot endpoints?**
- ✅ Use `/api/bots/` not `/api/v1/bots/`
- ✅ Ensure server is restarted after changes
- ✅ Check Swagger UI at `/docs` to verify routes

### **Getting 401 Unauthorized?**
- ✅ Include `Authorization: Bearer <token>` header
- ✅ Token should be from `/api/v1/auth/signin`
- ✅ Check token is not expired

### **CORS errors?**
- ✅ Backend CORS is configured for `*` in development
- ✅ For production, add your frontend domain

---

## 📚 **Related Documentation**

- `FRONTEND_API_QUICK_REFERENCE.md` - Quick reference
- `FRONTEND_DEBUG_GUIDE.md` - Debugging guide
- `NON_BLOCKING_BOT_FIX.md` - Bot execution fix
- Swagger UI: `http://localhost:8000/docs`
