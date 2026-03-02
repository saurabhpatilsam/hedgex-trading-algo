"""
Bot Thread Manager - Properly manages bot threads with real control.
This replaces the broken bot control system.
"""
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime
from typing import Dict, Optional, Any
from enum import Enum
from app.utils.logging_setup import logger


class BotThreadStatus(Enum):
    """Real thread status (not just database status)."""
    STARTING = "starting"
    RUNNING = "running"
    PAUSED = "paused"
    STOPPING = "stopping"
    STOPPED = "stopped"
    COMPLETED = "completed"
    ERROR = "error"


class BotThread:
    """Wrapper for a bot thread with control mechanisms."""
    
    def __init__(self, bot_id: str):
        self.bot_id = bot_id
        self.future: Optional[Future] = None
        self.pause_event = threading.Event()
        self.stop_event = threading.Event()
        self.status = BotThreadStatus.STARTING
        self.start_time = datetime.now()
        self.error: Optional[str] = None
        
        # Start with pause_event set (not paused)
        self.pause_event.set()
    
    def pause(self) -> bool:
        """Pause the bot thread."""
        if self.status == BotThreadStatus.RUNNING:
            self.pause_event.clear()
            self.status = BotThreadStatus.PAUSED
            logger.info(f"⏸️ Bot {self.bot_id} paused")
            return True
        logger.warning(f"Cannot pause bot {self.bot_id} in status {self.status}")
        return False
    
    def resume(self) -> bool:
        """Resume the bot thread."""
        if self.status == BotThreadStatus.PAUSED:
            self.pause_event.set()
            self.status = BotThreadStatus.RUNNING
            logger.info(f"▶️ Bot {self.bot_id} resumed")
            return True
        logger.warning(f"Cannot resume bot {self.bot_id} in status {self.status}")
        return False
    
    def stop(self, timeout: float = 5.0) -> bool:
        """Stop the bot thread gracefully with timeout."""
        if self.status in [BotThreadStatus.STOPPED, BotThreadStatus.COMPLETED]:
            return True
            
        logger.info(f"🛑 Stopping bot {self.bot_id}...")
        self.status = BotThreadStatus.STOPPING
        
        # Set stop event
        self.stop_event.set()
        
        # Unblock if paused
        self.pause_event.set()
        
        # Wait for thread to complete with timeout
        if self.future:
            try:
                self.future.result(timeout=timeout)
            except Exception as e:
                logger.error(f"Error stopping bot {self.bot_id}: {e}")
                
        self.status = BotThreadStatus.STOPPED
        logger.info(f"✅ Bot {self.bot_id} stopped")
        return True
    
    def is_alive(self) -> bool:
        """Check if thread is still running."""
        if not self.future:
            return False
        return not self.future.done()


class BotThreadManager:
    """
    Singleton manager for all bot threads.
    Provides real control over bot execution.
    """
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if not cls._instance:
            with cls._lock:
                if not cls._instance:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, 'initialized'):
            self.bots: Dict[str, BotThread] = {}
            self.executor = ThreadPoolExecutor(max_workers=10, thread_name_prefix="BotWorker")
            self.initialized = True
            logger.info("✅ BotThreadManager initialized")
    
    def start_bot(self, bot_id: str, run_function, *args, **kwargs) -> bool:
        """
        Start a new bot thread with control mechanisms.
        
        Args:
            bot_id: Unique bot identifier
            run_function: The function to run in the thread
            *args, **kwargs: Arguments for the run function
        """
        if bot_id in self.bots and self.bots[bot_id].is_alive():
            logger.error(f"Bot {bot_id} is already running!")
            return False
        
        # Create bot thread control
        bot_thread = BotThread(bot_id)
        
        # Create wrapper function that respects control events
        def controlled_run():
            try:
                bot_thread.status = BotThreadStatus.RUNNING
                logger.info(f"🚀 Bot {bot_id} thread started")
                
                # Pass control events to the run function
                kwargs['pause_event'] = bot_thread.pause_event
                kwargs['stop_event'] = bot_thread.stop_event
                kwargs['bot_id'] = bot_id
                
                result = run_function(*args, **kwargs)
                
                bot_thread.status = BotThreadStatus.COMPLETED
                logger.info(f"✅ Bot {bot_id} completed successfully")
                return result
                
            except Exception as e:
                bot_thread.status = BotThreadStatus.ERROR
                bot_thread.error = str(e)
                logger.error(f"❌ Bot {bot_id} error: {e}")
                raise
        
        # Submit to executor
        future = self.executor.submit(controlled_run)
        bot_thread.future = future
        
        # Register bot
        self.bots[bot_id] = bot_thread
        
        logger.info(f"✅ Bot {bot_id} submitted to thread pool")
        return True
    
    def pause_bot(self, bot_id: str) -> bool:
        """Pause a running bot."""
        if bot_id not in self.bots:
            logger.error(f"Bot {bot_id} not found")
            return False
        
        return self.bots[bot_id].pause()
    
    def resume_bot(self, bot_id: str) -> bool:
        """Resume a paused bot."""
        if bot_id not in self.bots:
            logger.error(f"Bot {bot_id} not found")
            return False
        
        return self.bots[bot_id].resume()
    
    def stop_bot(self, bot_id: str, timeout: float = 10.0) -> bool:
        """Stop a bot with timeout."""
        if bot_id not in self.bots:
            logger.error(f"Bot {bot_id} not found")
            return False
        
        success = self.bots[bot_id].stop(timeout)
        
        # Clean up if stopped
        if success:
            del self.bots[bot_id]
        
        return success
    
    def force_kill_bot(self, bot_id: str) -> bool:
        """Force kill a bot (last resort)."""
        if bot_id not in self.bots:
            return True
        
        bot = self.bots[bot_id]
        
        # Set all events to stop
        bot.stop_event.set()
        bot.pause_event.set()
        
        # Cancel the future (may not work if already started)
        if bot.future and not bot.future.done():
            cancelled = bot.future.cancel()
            logger.warning(f"Force cancelled bot {bot_id}: {cancelled}")
        
        # Remove from registry
        del self.bots[bot_id]
        
        logger.warning(f"⚠️ Force killed bot {bot_id}")
        return True
    
    def get_bot_status(self, bot_id: str) -> Optional[BotThreadStatus]:
        """Get real thread status of a bot."""
        if bot_id not in self.bots:
            return None
        
        bot = self.bots[bot_id]
        
        # Update status if thread completed
        if not bot.is_alive():
            if bot.status not in [BotThreadStatus.COMPLETED, BotThreadStatus.ERROR, BotThreadStatus.STOPPED]:
                bot.status = BotThreadStatus.COMPLETED
        
        return bot.status
    
    def get_all_bots(self) -> Dict[str, Dict[str, Any]]:
        """Get status of all registered bots."""
        result = {}
        
        for bot_id, bot in self.bots.items():
            result[bot_id] = {
                "bot_id": bot_id,
                "status": bot.status.value,
                "is_alive": bot.is_alive(),
                "start_time": bot.start_time.isoformat(),
                "error": bot.error
            }
        
        return result
    
    def cleanup_dead_bots(self):
        """Remove completed/dead bots from registry."""
        dead_bots = []
        
        for bot_id, bot in self.bots.items():
            if not bot.is_alive() and bot.status in [BotThreadStatus.COMPLETED, BotThreadStatus.STOPPED, BotThreadStatus.ERROR]:
                dead_bots.append(bot_id)
        
        for bot_id in dead_bots:
            logger.info(f"🧹 Cleaning up dead bot {bot_id}")
            del self.bots[bot_id]
        
        return len(dead_bots)
    
    def emergency_stop_all(self, timeout: float = 5.0):
        """Emergency stop all bots."""
        logger.warning("🚨 EMERGENCY STOP ALL BOTS")
        
        for bot_id in list(self.bots.keys()):
            try:
                self.stop_bot(bot_id, timeout)
            except Exception as e:
                logger.error(f"Failed to stop bot {bot_id}: {e}")
                self.force_kill_bot(bot_id)
    
    def shutdown(self):
        """Shutdown the thread manager."""
        logger.info("Shutting down BotThreadManager...")
        
        # Stop all bots
        self.emergency_stop_all()
        
        # Shutdown executor
        self.executor.shutdown(wait=True, timeout=10)
        
        logger.info("✅ BotThreadManager shutdown complete")


# Global instance
bot_thread_manager = BotThreadManager()
