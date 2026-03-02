import { NextRequest } from 'next/server';
import { getSharedSubscriber } from '@/lib/redis';
import { connectionManager } from '@/lib/connection-manager';
import { getPriceChannelConfigs } from '@/lib/config';

// Force dynamic rendering - this route should never be statically generated
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  let pubsub: any = null;
  let keepAliveInterval: NodeJS.Timeout | null = null;
  let heartbeatInterval: NodeJS.Timeout | null = null;
  let controllerClosed = false;
  let cleanupCalled = false;
  const connectionId = `sse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Get channels from environment configuration
  const priceConfigs = getPriceChannelConfigs();
  const channels = priceConfigs.map(config => config.channel);
  
  console.log('🎯 Price Stream - Initializing SSE connection:', connectionId);
  console.log('📋 Price configs:', priceConfigs);
  console.log('📡 Channels to subscribe:', channels);

  try {
    // Use shared subscriber to avoid connection leaks
    pubsub = await getSharedSubscriber();
    if (!pubsub) {
      console.error('❌ Failed to get Redis subscriber');
      return new Response('Redis connection failed', { status: 500 });
    }
    console.log('✅ Redis subscriber obtained, status:', pubsub.status);
    
    // Track this connection (connection manager now handles limits gracefully)
    connectionManager.addConnection(connectionId);
    


    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        // Set up cleanup function
        const cleanup = async () => {
          if (cleanupCalled) return; // Prevent double cleanup
          cleanupCalled = true;
          controllerClosed = true;
          

          
          // Clear intervals first
          if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
          }
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
          }
          
          // Safely close controller first
          try {
            controller.close();
          } catch (error) {
            // Ignore controller close errors
          }
          
          // Remove from connection manager (shared subscriber handles Redis cleanup)
          connectionManager.removeConnection(connectionId);
        };

        // Subscribe to all channels using dedicated pubsub client
        console.log('🔔 Starting channel subscriptions...');
        for (const channel of channels) {
          try {
            await pubsub.subscribe(channel);
            console.log(`✅ Successfully subscribed to channel: ${channel}`);
          } catch (err) {
            console.error(`❌ Failed to subscribe to ${channel}:`, err);
          }
        }
        console.log('🎉 All channel subscriptions completed');
        

        
        // Send initial heartbeat to establish connection
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ channel: 'heartbeat', data: { type: 'heartbeat' }, timestamp: new Date().toISOString() })}\n\n`));
        
        // Set up heartbeat to keep connection alive
        heartbeatInterval = setInterval(() => {
          if (!controllerClosed) {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ channel: 'heartbeat', data: { type: 'heartbeat' }, timestamp: new Date().toISOString() })}\n\n`));
            } catch (error) {
              controllerClosed = true;
            }
          }
        }, 30000); // Send heartbeat every 30 seconds
        
        // Set up message handler for all channels
        pubsub.on('message', (channel: string, message: string) => {
          // console.log('📨 Redis message received:', { channel, messageLength: message?.length, messagePreview: message?.substring(0, 100) });
          
          // Check if controller is still open before trying to enqueue
          if (!controllerClosed) {
            try {
              let data = null;
              
              // Try to parse the message, but allow null/empty messages
              if (message && message.trim()) {
                data = JSON.parse(message);
                // console.log('✅ Parsed message data:', { channel, data });
              } else {
                console.warn('⚠️ Empty message received for channel:', channel);
              }
              
              const priceUpdate = {
                channel,
                data,
                timestamp: new Date().toISOString()
              };
              
              // Add error handling for controller enqueue
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(priceUpdate)}\n\n`));
                // console.log('📤 Price update sent to client:', { channel, hasData: !!data });
              } catch (enqueueError) {
                console.error('❌ Failed to enqueue message:', enqueueError);
                controllerClosed = true;
              }
            } catch (error) {
              // If parsing fails, send null data
              console.error('❌ Error parsing message:', { channel, error, message: message?.substring(0, 100) });
              const priceUpdate = {
                channel,
                data: null,
                timestamp: new Date().toISOString()
              };
              
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(priceUpdate)}\n\n`));
              } catch (enqueueError) {
                controllerClosed = true;
              }
            }
          }
        });



        // Cleanup on close
        request.signal.addEventListener('abort', () => cleanup());
        request.signal.addEventListener('close', () => cleanup());
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    });
  } catch (error) {

    
    // Cleanup on error
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
    }
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    // Remove from connection manager (shared subscriber handles Redis cleanup)
    connectionManager.removeConnection(connectionId);
    
    return new Response('Internal server error', { status: 500 });
  }
}
