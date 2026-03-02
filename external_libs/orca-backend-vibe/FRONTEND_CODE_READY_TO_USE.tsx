// ============================================================
// FRONTEND CODE - READY TO USE
// Copy this into your React components
// ============================================================

import { useEffect, useState } from 'react'

// ============================================================
// TYPE DEFINITIONS
// ============================================================

interface Bot {
  bot_id: string
  custom_name: string | null
  status: 'initializing' | 'running' | 'paused' | 'stopped' | 'error'
  instrument: string
  account_name: string
  accounts_ids: string | null
  start_time: string
  last_health_check: string
  stopped_at: string | null
  total_pnl: number
  open_positions: number
  closed_positions: number
  active_orders: number
  won_orders: number
  lost_orders: number
  data_source: string
}

interface BotListResponse {
  bots: Bot[]
  total: number
  active: number
  paused: number
  stopped: number
  error: number
  timestamp: string
}

// ============================================================
// 1. BOT DASHBOARD - LIVE UPDATES
// Use this for components that show active/running bots
// ============================================================

export function BotDashboard() {
  const [bots, setBots] = useState<Bot[]>([])
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    paused: 0,
    stopped: 0,
    error: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  useEffect(() => {
    const fetchBots = async () => {
      try {
        const token = localStorage.getItem('access_token')
        
        if (!token) {
          setError('No authentication token found')
          setLoading(false)
          return
        }

        const response = await fetch('http://localhost:8000/api/bots/', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) {
          if (response.status === 401) {
            setError('Unauthorized - please login again')
          } else {
            setError(`Failed to fetch bots: ${response.status}`)
          }
          setLoading(false)
          return
        }

        const data: BotListResponse = await response.json()
        
        setBots(data.bots)
        setStats({
          total: data.total,
          active: data.active,
          paused: data.paused,
          stopped: data.stopped,
          error: data.error
        })
        setLastUpdate(new Date(data.timestamp))
        setError(null)
        setLoading(false)

        console.log(`✅ Fetched ${data.bots.length} bots at ${data.timestamp}`)
      } catch (err) {
        console.error('Error fetching bots:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setLoading(false)
      }
    }

    // Fetch immediately on mount
    fetchBots()

    // Then poll every 10 seconds
    const interval = setInterval(fetchBots, 10000)

    // CRITICAL: Cleanup interval when component unmounts
    return () => {
      clearInterval(interval)
      console.log('🧹 Cleaned up bot polling interval')
    }
  }, []) // Empty dependency array - only run on mount/unmount

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-2">Loading bots...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
        <p className="text-red-800">Error: {error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* Stats Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Trading Bots Dashboard</h1>
        
        <div className="grid grid-cols-5 gap-4 mb-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600">Total</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600">Running</div>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600">Paused</div>
            <div className="text-2xl font-bold text-yellow-600">{stats.paused}</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600">Stopped</div>
            <div className="text-2xl font-bold text-gray-600">{stats.stopped}</div>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600">Error</div>
            <div className="text-2xl font-bold text-red-600">{stats.error}</div>
          </div>
        </div>

        {lastUpdate && (
          <p className="text-sm text-gray-500">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Bot List */}
      <div className="space-y-4">
        {bots.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No bots found. Start a bot to see it here.
          </div>
        ) : (
          bots.map((bot) => (
            <BotCard key={bot.bot_id} bot={bot} />
          ))
        )}
      </div>
    </div>
  )
}

// ============================================================
// 2. BOT CARD COMPONENT
// Individual bot display
// ============================================================

function BotCard({ bot }: { bot: Bot }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-100 text-green-800 border-green-300'
      case 'paused': return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'stopped': return 'bg-gray-100 text-gray-800 border-gray-300'
      case 'error': return 'bg-red-100 text-red-800 border-red-300'
      default: return 'bg-blue-100 text-blue-800 border-blue-300'
    }
  }

  const formatPnL = (pnl: number) => {
    const formatted = pnl.toFixed(2)
    return pnl >= 0 ? `+$${formatted}` : `-$${Math.abs(pnl).toFixed(2)}`
  }

  return (
    <div className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-lg">
            {bot.custom_name || bot.bot_id}
          </h3>
          <p className="text-sm text-gray-500">{bot.instrument} • {bot.account_name}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(bot.status)}`}>
          {bot.status.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-4 text-center">
        <div>
          <div className="text-xs text-gray-600">P&L</div>
          <div className={`font-bold ${bot.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatPnL(bot.total_pnl)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-600">Open</div>
          <div className="font-bold">{bot.open_positions}</div>
        </div>
        <div>
          <div className="text-xs text-gray-600">Closed</div>
          <div className="font-bold">{bot.closed_positions}</div>
        </div>
        <div>
          <div className="text-xs text-gray-600">Win Rate</div>
          <div className="font-bold">
            {bot.won_orders + bot.lost_orders > 0 
              ? `${((bot.won_orders / (bot.won_orders + bot.lost_orders)) * 100).toFixed(1)}%`
              : 'N/A'}
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button className="flex-1 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
          View Details
        </button>
        {bot.status === 'running' && (
          <button className="flex-1 px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm">
            Pause
          </button>
        )}
        {bot.status === 'paused' && (
          <button className="flex-1 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm">
            Resume
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================
// 3. RUN HISTORY VIEW - NO POLLING
// Use this for historical run records
// ============================================================

interface RunConfig {
  id: number
  status: string
  created_at: string
  config: any
}

export function RunHistoryTab() {
  const [configs, setConfigs] = useState<RunConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRunHistory = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      
      if (!token) {
        setError('No authentication token found')
        setLoading(false)
        return
      }

      const response = await fetch('http://localhost:8000/api/v1/run-bot/configs', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      setConfigs(data.configs)
      setError(null)
      setLoading(false)

      console.log(`✅ Fetched ${data.configs.length} run configs`)
    } catch (err) {
      console.error('Error fetching run history:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setLoading(false)
    }
  }

  useEffect(() => {
    // Fetch ONCE on mount - NO POLLING for history
    fetchRunHistory()
    
    // No interval needed for historical data
  }, [])

  if (loading) {
    return <div className="p-4">Loading history...</div>
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
        <p className="text-red-800">Error: {error}</p>
        <button 
          onClick={fetchRunHistory}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Run History</h1>
        <button
          onClick={fetchRunHistory}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        {configs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No run history found
          </div>
        ) : (
          configs.map((config) => (
            <div key={config.id} className="border rounded p-3 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="font-medium">Run #{config.id}</span>
                <span className="text-sm text-gray-500">
                  {new Date(config.created_at).toLocaleString()}
                </span>
                <span className={`px-2 py-1 rounded text-xs ${
                  config.status === 'completed' ? 'bg-green-100 text-green-800' :
                  config.status === 'running' ? 'bg-blue-100 text-blue-800' :
                  config.status === 'failed' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {config.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ============================================================
// 4. USING REACT QUERY (RECOMMENDED)
// Install: npm install @tanstack/react-query
// ============================================================

/*
import { useQuery } from '@tanstack/react-query'

const fetchBots = async (): Promise<BotListResponse> => {
  const token = localStorage.getItem('access_token')
  const response = await fetch('http://localhost:8000/api/bots/', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })
  
  if (!response.ok) {
    throw new Error('Failed to fetch bots')
  }
  
  return response.json()
}

export function BotDashboardWithReactQuery() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['bots'],
    queryFn: fetchBots,
    refetchInterval: 10000, // Poll every 10 seconds
    staleTime: 3000, // Consider data fresh for 3 seconds (matches backend cache)
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">
        Active Bots ({data.active} running)
      </h1>
      <div className="space-y-4">
        {data.bots.map(bot => (
          <BotCard key={bot.bot_id} bot={bot} />
        ))}
      </div>
    </div>
  )
}
*/

// ============================================================
// NOTES
// ============================================================

/*
1. CRITICAL: Always include cleanup in useEffect:
   return () => clearInterval(interval)

2. Use /api/bots/ for LIVE bot status (poll every 10 seconds)

3. Use /api/v1/run-bot/configs for HISTORY (fetch once, no polling)

4. Include Authorization header in all requests

5. Handle errors gracefully

6. Consider React Query for better caching and performance

7. Test in browser Network tab to verify correct behavior
*/
