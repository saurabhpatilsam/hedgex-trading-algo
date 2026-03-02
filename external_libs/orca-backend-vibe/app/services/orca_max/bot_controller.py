"""
Bot controller that manages pause/resume/stop functionality.
"""
import asyncio
import time
from typing import Optional
from app.services.orca_supabase.bot_supabase import BotSupabase
from app.utils.logging_setup import logger


class BotController:
    """Controller that manages bot state and execution control."""
    
    def __init__(self, bot_id: str):
        self.bot_id = bot_id
        self.supabase = BotSupabase()
        self.is_paused = False
        self.should_stop = False
        self.last_status_check = 0
        self.status_check_interval = 5  # Check status every 5 seconds
        
    def check_status(self) -> str:
        """Check bot status from Supabase."""
        try:
            # Only check every N seconds to avoid too many DB calls
            current_time = time.time()
            if current_time - self.last_status_check < self.status_check_interval:
                return "running" if not self.is_paused else "paused"
            
            self.last_status_check = current_time
            
            # Get bot status from Supabase
            bot = self.supabase.get_bot(self.bot_id)
            if bot:
                status = bot.get("status", "running")
                
                # Update internal state
                self.is_paused = (status == "paused")
                self.should_stop = (status == "stopped")
                
                if self.should_stop:
                    logger.info(f"🛑 Bot {self.bot_id} received stop signal")
                elif self.is_paused:
                    logger.info(f"⏸️ Bot {self.bot_id} is paused")
                    
                return status
            
            return "running"
            
        except Exception as e:
            logger.error(f"Error checking bot status: {e}")
            return "running"  # Continue running on error
    
    def wait_if_paused(self):
        """Block execution if bot is paused."""
        while True:
            status = self.check_status()
            
            if self.should_stop:
                raise StopIteration(f"Bot {self.bot_id} stopped")
            
            if not self.is_paused:
                break
                
            # Bot is paused, wait and check again
            logger.debug(f"Bot {self.bot_id} is paused, waiting...")
            time.sleep(2)
    
    def should_continue(self) -> bool:
        """Check if bot should continue running."""
        status = self.check_status()
        return not self.should_stop
