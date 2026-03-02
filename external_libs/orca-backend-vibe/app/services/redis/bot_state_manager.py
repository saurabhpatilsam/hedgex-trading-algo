"""
Bot State Manager - redirects to Supabase implementation.
This file is kept for compatibility with existing imports.
"""
# Re-export the Supabase implementation
from app.services.orca_supabase.bot_state_manager import BotStateManager

# Keep backward compatibility
__all__ = ['BotStateManager']

# Original Redis implementation commented out for reference:

import json
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from app.services.orca_redis.client import get_redis_client
from app.utils.logging_setup import logger


class BotStateManager_REDIS_DEPRECATED():
    """Manages bot state in Redis with 24-hour TTL."""
    
    REDIS_KEY_PREFIX = "bot:state:"
    TTL_SECONDS = 86400  # 24 hours
    
    def __init__(self, bot_id: str):
        self.bot_id = bot_id
        self.redis_key = f"{self.REDIS_KEY_PREFIX}{bot_id}"
    
    async def initialize_state(
        self,
        instrument: str,
        account_name: str,
        accounts_ids: str,
        custom_name: Optional[str] = None
    ) -> bool:
        """Initialize a new bot state in Redis."""
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
            
            redis = await get_redis_client()
            await redis.setex(
                self.redis_key,
                self.TTL_SECONDS,
                json.dumps(initial_state)
            )
            logger.info(f"✅ Initialized Redis state for bot {self.bot_id}")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to initialize Redis state for bot {self.bot_id}: {e}")
            return False
    
    async def update_status(self, status: str) -> bool:
        """Update bot status."""
        try:
            state = await self.get_state()
            if state:
                state["status"] = status
                state["last_health_check"] = datetime.now(timezone.utc).isoformat()
                
                redis = await get_redis_client()
                await redis.setex(
                    self.redis_key,
                    self.TTL_SECONDS,
                    json.dumps(state)
                )
                logger.info(f"📊 Updated status to '{status}' for bot {self.bot_id}")
                return True
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
                
                redis = await get_redis_client()
                await redis.setex(
                    self.redis_key,
                    self.TTL_SECONDS,
                    json.dumps(state)
                )
                logger.info(f"📈 Updated trading metrics for bot {self.bot_id}")
                return True
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
                
                # Keep only last 100 actions
                if "actions" not in state:
                    state["actions"] = []
                state["actions"].append(action)
                if len(state["actions"]) > 100:
                    state["actions"] = state["actions"][-100:]
                
                state["last_health_check"] = datetime.now(timezone.utc).isoformat()
                
                redis = await get_redis_client()
                await redis.setex(
                    self.redis_key,
                    self.TTL_SECONDS,
                    json.dumps(state)
                )
                logger.info(f"📝 Recorded action '{action_type}' for bot {self.bot_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"❌ Failed to record action for bot {self.bot_id}: {e}")
            return False
    
    async def get_state(self) -> Optional[Dict[str, Any]]:
        """Get current bot state from Redis."""
        try:
            redis = await get_redis_client()
            state_json = await redis.get(self.redis_key)
            if state_json:
                return json.loads(state_json)
            return None
        except Exception as e:
            logger.error(f"❌ Failed to get state for bot {self.bot_id}: {e}")
            return None
    
    async def delete_state(self) -> bool:
        """Delete bot state from Redis."""
        try:
            redis = await get_redis_client()
            result = await redis.delete(self.redis_key)
            logger.info(f"🗑️ Deleted Redis state for bot {self.bot_id}")
            return result == 1
        except Exception as e:
            logger.error(f"❌ Failed to delete state for bot {self.bot_id}: {e}")
            return False
    
    async def extend_ttl(self) -> bool:
        """Extend the TTL of the bot state."""
        try:
            redis = await get_redis_client()
            result = await redis.expire(self.redis_key, self.TTL_SECONDS)
            if result:
                logger.debug(f"⏰ Extended TTL for bot {self.bot_id}")
            return result
        except Exception as e:
            logger.error(f"❌ Failed to extend TTL for bot {self.bot_id}: {e}")
            return False
    
    @classmethod
    async def get_all_bots(cls) -> List[Dict[str, Any]]:
        """Get all bot states from Redis."""
        try:
            redis = await get_redis_client()
            pattern = f"{cls.REDIS_KEY_PREFIX}*"
            keys = await redis.keys(pattern)
            
            bots = []
            for key in keys:
                state_json = await redis.get(key)
                if state_json:
                    bots.append(json.loads(state_json))
            
            return bots
        except Exception as e:
            logger.error(f"❌ Failed to get all bot states: {e}")
            return []
