"""
Bot State Manager using Supabase for state tracking.
Replaces Redis with Supabase's bot_state table.
"""
import json
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from app.services.orca_supabase.bot_supabase import BotSupabase
from app.utils.logging_setup import logger


class BotStateManager:
    """Manages bot state in Supabase with 24-hour TTL."""
    
    TTL_HOURS = 24  # 24 hours TTL
    
    def __init__(self, bot_id: str):
        self.bot_id = bot_id
        self.supabase = BotSupabase()
    
    async def initialize_state(
        self,
        instrument: str,
        account_name: str,
        accounts_ids: str,
        custom_name: Optional[str] = None
    ) -> bool:
        """Initialize a new bot state in Supabase."""
        try:
            initial_state = {
                "bot_id": self.bot_id,
                "custom_name": custom_name,
                "status": "initializing",
                "instrument": instrument,
                "account_name": account_name,
                "accounts_ids": accounts_ids,
                "start_time": datetime.now(timezone.utc).isoformat(),
                "last_health_check": datetime.now(timezone.utc).isoformat(),
                "total_pnl": 0.0,
                "open_positions": 0,
                "closed_positions": 0,
                "active_orders": 0,
                "won_orders": 0,
                "lost_orders": 0,
                "actions": []
            }
            
            # Store in bot_state table (Redis-like with expiry)
            success = self.supabase.upsert_bot_state(self.bot_id, initial_state)
            
            if success:
                logger.info(f"✅ Initialized Supabase state for bot {self.bot_id}")
            return success
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize Supabase state for bot {self.bot_id}: {e}")
            return False
    
    async def update_status(self, status: str) -> bool:
        """Update bot status."""
        try:
            state = await self.get_state()
            if state:
                state["status"] = status
                state["last_health_check"] = datetime.now(timezone.utc).isoformat()
                
                success = self.supabase.upsert_bot_state(self.bot_id, state)
                
                if success:
                    # Also update in main bots table
                    self.supabase.update_bot_status(self.bot_id, status)
                    logger.info(f"📊 Updated status to '{status}' for bot {self.bot_id}")
                return success
            return False
            
        except Exception as e:
            logger.error(f"❌ Failed to update status for bot {self.bot_id}: {e}")
            return False
    
    async def update_trading_metrics(
        self,
        total_pnl: Optional[float] = None,
        open_positions: Optional[int] = None,
        closed_positions: Optional[int] = None,
        active_orders: Optional[int] = None,
        won_orders: Optional[int] = None,
        lost_orders: Optional[int] = None
    ) -> bool:
        """Update trading metrics for the bot."""
        try:
            state = await self.get_state()
            if state:
                # Update state
                if total_pnl is not None:
                    state["total_pnl"] = total_pnl
                if open_positions is not None:
                    state["open_positions"] = open_positions
                if closed_positions is not None:
                    state["closed_positions"] = closed_positions
                if active_orders is not None:
                    state["active_orders"] = active_orders
                if won_orders is not None:
                    state["won_orders"] = won_orders
                if lost_orders is not None:
                    state["lost_orders"] = lost_orders
                
                state["last_health_check"] = datetime.now(timezone.utc).isoformat()
                
                # Update in bot_state table
                success = self.supabase.upsert_bot_state(self.bot_id, state)
                
                if success:
                    # Also update metrics in main bots table
                    metrics = {}
                    if total_pnl is not None:
                        metrics["total_pnl"] = total_pnl
                    if open_positions is not None:
                        metrics["open_positions"] = open_positions
                    if closed_positions is not None:
                        metrics["closed_positions"] = closed_positions
                    if active_orders is not None:
                        metrics["active_orders"] = active_orders
                    if won_orders is not None:
                        metrics["won_orders"] = won_orders
                    if lost_orders is not None:
                        metrics["lost_orders"] = lost_orders
                    
                    if metrics:
                        self.supabase.update_bot_metrics(self.bot_id, **metrics)
                    
                    logger.info(f"📈 Updated trading metrics for bot {self.bot_id}")
                return success
            return False
            
        except Exception as e:
            logger.error(f"❌ Failed to update trading metrics for bot {self.bot_id}: {e}")
            return False
    
    async def record_action(
        self,
        action_type: str,
        metadata: Optional[Dict[str, Any]] = None,
        performed_by: str = "system"
    ) -> bool:
        """Record an action taken on the bot."""
        try:
            state = await self.get_state()
            if state:
                action = {
                    "action_type": action_type,
                    "performed_by": performed_by,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "metadata": metadata or {}
                }
                
                # Keep only last 100 actions in state
                if "actions" not in state:
                    state["actions"] = []
                state["actions"].append(action)
                if len(state["actions"]) > 100:
                    state["actions"] = state["actions"][-100:]
                
                state["last_health_check"] = datetime.now(timezone.utc).isoformat()
                
                # Update state
                success = self.supabase.upsert_bot_state(self.bot_id, state)
                
                # Also record in bot_actions table for permanent audit trail
                self.supabase.insert_bot_action(
                    bot_id=self.bot_id,
                    action_type=action_type,
                    performed_by=performed_by,
                    details=metadata,
                    success=True
                )
                
                if success:
                    logger.info(f"📝 Recorded action '{action_type}' for bot {self.bot_id}")
                return success
            return False
            
        except Exception as e:
            logger.error(f"❌ Failed to record action for bot {self.bot_id}: {e}")
            return False
    
    async def get_state(self) -> Optional[Dict[str, Any]]:
        """Get current bot state from Supabase."""
        try:
            state = self.supabase.get_bot_state(self.bot_id)
            return state
            
        except Exception as e:
            logger.error(f"❌ Failed to get state for bot {self.bot_id}: {e}")
            return None
    
    async def delete_state(self) -> bool:
        """Delete bot state from Supabase."""
        try:
            result = self.supabase.delete_bot_state(self.bot_id)
            if result:
                logger.info(f"🗑️ Deleted Supabase state for bot {self.bot_id}")
            return result
            
        except Exception as e:
            logger.error(f"❌ Failed to delete state for bot {self.bot_id}: {e}")
            return False
    
    async def extend_ttl(self) -> bool:
        """Extend the TTL of the bot state."""
        try:
            result = self.supabase.extend_bot_state_ttl(self.bot_id)
            if result:
                logger.debug(f"⏰ Extended TTL for bot {self.bot_id}")
            return result
            
        except Exception as e:
            logger.error(f"❌ Failed to extend TTL for bot {self.bot_id}: {e}")
            return False
    
    @classmethod
    async def get_all_bots(cls) -> List[Dict[str, Any]]:
        """Get all bot states from Supabase."""
        try:
            return BotSupabase.get_all_bot_states()
            
        except Exception as e:
            logger.error(f"❌ Failed to get all bot states: {e}")
            return []
    
    @classmethod
    async def clean_expired_states(cls) -> int:
        """Clean up expired bot states."""
        try:
            return BotSupabase.clean_expired_states()
            
        except Exception as e:
            logger.error(f"❌ Failed to clean expired states: {e}")
            return 0
