# Orca Trading Dashboard

A real-time trading bot control and monitoring dashboard built with Next.js 14, TypeScript, and shadcn/ui.

## Features

- **Real-time Price Monitoring**: Live price updates from Redis streams for 4 instruments
- **Trading Bot Management**: Monitor and control automated trading strategies
- **Account Summary**: View positions and orders with real-time updates
- **Responsive Design**: Modern, compact UI optimized for trading workflows

## Prerequisites

- Node.js 18+ 
- Redis server with SSL enabled
- Trading data streams configured

## Environment Setup

1. **Copy the environment template:**
   ```bash
   cp .env.local.example .env.local
   ```

2. **Configure Redis connection in `.env.local`:**
   ```env
   # Redis Connection Settings
   REDIS_HOST=your_redis_host_here
   REDIS_PORT=your_redis_port_here
   REDIS_PRIMARY_ACCESS_KEY=your_redis_password_here

   # Price Stream Channels
   TRADOVATE_MESU5_PRICE=TRADOVATE_MESU5_PRICE
   TRADOVATE_ESU5_PRICE=TRADOVATE_ESU5_PRICE
   TRADOVATE_MNQU5_PRICE=TRADOVATE_MNQU5_PRICE
   TRADOVATE_NQU5_PRICE=TRADOVATE_NQU5_PRICE
   ```

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Redis Stream Integration

The dashboard connects to Redis streams for real-time price data:

### Price Channels
- `TRADOVATE_MESU5_PRICE` → CME_MINI:MES1!
- `TRADOVATE_ESU5_PRICE` → CME_MINI:ES1!  
- `TRADOVATE_MNQU5_PRICE` → CME_MINI:NQ1!
- `TRADOVATE_NQU5_PRICE` → CME_MINI:YM1!

### Message Format
```json
{
  "TIMESTAMP": "2025-08-23 18:08:02.629394",
  "LAST": 6484.5,
  "INSTRUMENT": "MESU5"
}
```

### Real-time Updates
- **Server-Sent Events (SSE)**: Efficient real-time price streaming
- **Automatic Reconnection**: Handles connection drops gracefully
- **Fallback Data**: Shows dummy data when Redis is unavailable

## Architecture

### Frontend
- **Next.js 14**: App Router with TypeScript
- **shadcn/ui**: Modern component library
- **Tailwind CSS**: Utility-first styling
- **React Hooks**: Custom hooks for state management

### Backend
- **Next.js API Routes**: Server-side Redis connections
- **Redis Client**: Node.js Redis client with SSL support
- **Server-Sent Events**: Real-time data streaming

### Key Components
- `PriceCards`: Real-time price display
- `TradingBotsTab`: Bot management interface
- `AccountSummaryTab`: Positions and orders view
- `usePriceData`: Custom hook for price data management

## Development

### Project Structure
```
orca-controller/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   └── prices/        # Price data endpoints
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main dashboard
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── price-cards.tsx   # Price display
│   ├── trading-bots-tab.tsx
│   └── account-summary-tab.tsx
├── hooks/                # Custom React hooks
│   └── usePriceData.ts   # Price data management
├── lib/                  # Utilities
│   ├── redis.ts          # Redis connection
│   ├── data.ts           # Dummy data
│   └── types.ts          # TypeScript interfaces
└── .env.local            # Environment variables
```

### Adding New Instruments

1. **Update channel mapping in `hooks/usePriceData.ts`:**
   ```typescript
   const CHANNEL_MAPPING = {
     'YOUR_NEW_CHANNEL': 'DISPLAY_SYMBOL',
     // ... existing mappings
   };
   ```

2. **Add environment variable:**
   ```env
   YOUR_NEW_CHANNEL=YOUR_NEW_CHANNEL
   ```

3. **Update API routes** to include the new channel

## Production Deployment

1. **Set production environment variables**
2. **Configure Redis connection for production**
3. **Build the application:**
   ```bash
   npm run build
   npm start
   ```

## Troubleshooting

### Redis Connection Issues
- Verify Redis credentials in `.env.local`
- Check SSL configuration
- Ensure Redis server is running and accessible

### Price Data Not Updating
- Check browser console for SSE connection errors
- Verify Redis stream channels are active
- Monitor API route logs for errors

### Build Issues
- Clear Next.js cache: `rm -rf .next`
- Reinstall dependencies: `rm -rf node_modules && npm install`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.
