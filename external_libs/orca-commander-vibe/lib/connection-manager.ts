// Connection manager to track active SSE connections (not Redis connections)
class ConnectionManager {
  private activeConnections = new Set<string>();
  private connectionCounter = 0;
  private readonly MAX_CONNECTIONS = 20; // Reduced limit for better management

  addConnection(connectionId: string) {
    // Clean up stale connections first
    this.cleanupStaleConnections();
    
    // Check if we're at the limit
    if (this.activeConnections.size >= this.MAX_CONNECTIONS) {
      console.warn(`⚠️ Connection limit reached (${this.MAX_CONNECTIONS}). Cleaning up stale connections...`);
      this.forceCleanup();
    }
    
    this.activeConnections.add(connectionId);
    this.connectionCounter++;
    return true;
  }

  removeConnection(connectionId: string) {
    if (this.activeConnections.has(connectionId)) {
      this.activeConnections.delete(connectionId);
    }
  }

  // Clean up connections that might be stale
  private cleanupStaleConnections() {
    // If we have too many connections, remove some older ones
    if (this.activeConnections.size > this.MAX_CONNECTIONS * 0.7) {
      const connections = Array.from(this.activeConnections);
      const toRemove = connections.slice(0, Math.floor(this.activeConnections.size * 0.5)); // Remove 50% of oldest
      toRemove.forEach(id => this.activeConnections.delete(id));
      console.log(`🧹 Auto-cleanup: Removed ${toRemove.length} stale connections`);
    }
  }

  getActiveCount() {
    return this.activeConnections.size;
  }

  getTotalCount() {
    return this.connectionCounter;
  }

  logStatus() {
    console.log(`📊 SSE Connections - Active: ${this.activeConnections.size}, Total created: ${this.connectionCounter}`);
  }

  // Force cleanup of all connections (emergency cleanup)
  forceCleanup() {
    const count = this.activeConnections.size;
    this.activeConnections.clear();
    console.log(`🧹 Emergency cleanup: Removed ${count} SSE connections`);
  }

  // Get connection count for monitoring
  getConnectionCount() {
    return this.activeConnections.size;
  }
}

export const connectionManager = new ConnectionManager();
