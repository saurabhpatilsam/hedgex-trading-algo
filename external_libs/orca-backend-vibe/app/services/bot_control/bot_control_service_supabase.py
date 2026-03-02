"""
Bot control service using Supabase for managing bot lifecycle and actions.
"""
import json
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from app.services.orca_supabase.bot_supabase import BotSupabase
from app.services.orca_supabase.bot_state_manager import BotStateManager
from app.schemas.bot_schemas import BotStatus, ActionType
from app.utils.logging_setup import logger


class BotControlService:
    """Service for controlling bot operations using Supabase."""
    
    def __init__(self):
        self.supabase = BotSupabase()
    
    async def create_bot(
        self,
        bot_id: str,
        instrument: str,
        account_name: str,
        accounts_ids: Optional[str] = None,
        custom_name: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        created_by: str = "system"
    ) -> bool:
        """Create a new bot in both Supabase bot_state and bots tables."""
        try:
            # Check if bot already exists
            existing = self.supabase.get_bot(bot_id)
            if existing:
                logger.warning(f"Bot {bot_id} already exists")
                return False
            
            # Create in main bots table FIRST (required for foreign key)
            bot = self.supabase.insert_bot(
                bot_id=bot_id,
                custom_name=custom_name,
                instrument=instrument,
                account_name=account_name,
                accounts_ids=accounts_ids,
                config=config,
                created_by=created_by
            )
            
            if not bot:
                logger.error(f"Failed to insert bot {bot_id} into bots table")
                return False
            
            logger.info(f"✅ Bot {bot_id} created in bots table")
            
            # Create initial action
            self.supabase.insert_bot_action(
                bot_id=bot_id,
                action_type=ActionType.START,
                performed_by=created_by,
                details={"config": config}
            )
            
            # Initialize state (Redis-like table) AFTER bot exists in bots table
            try:
                state_manager = BotStateManager(bot_id)
                state_initialized = await state_manager.initialize_state(
                    instrument=instrument,
                    account_name=account_name,
                    accounts_ids=accounts_ids or "",
                    custom_name=custom_name
                )
                
                if not state_initialized:
                    logger.warning(f"Failed to initialize state for bot {bot_id}, but bot was created")
            except Exception as e:
                logger.warning(f"State initialization failed for bot {bot_id}: {e}, but bot was created")
            
            logger.info(f"✅ Created bot {bot_id}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to create bot {bot_id}: {e}")
            return False
    
    async def pause_bot(
        self,
        bot_id: str,
        performed_by: str,
        reason: Optional[str] = None
    ) -> bool:
        """Pause a running bot."""
        try:
            # Update state
            state_manager = BotStateManager(bot_id)
            state_updated = await state_manager.update_status(BotStatus.PAUSED)
            
            # Record action in state
            await state_manager.record_action(
                ActionType.PAUSE,
                {"reason": reason} if reason else None,
                performed_by
            )
            
            # Update main bots table
            self.supabase.update_bot_status(bot_id, BotStatus.PAUSED)
            
            # Log action in database
            self.supabase.insert_bot_action(
                bot_id=bot_id,
                action_type=ActionType.PAUSE,
                performed_by=performed_by,
                details={"reason": reason} if reason else None,
                success=True
            )
            
            logger.info(f"⏸️ Paused bot {bot_id} by {performed_by}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to pause bot {bot_id}: {e}")
            
            # Log failed action
            self.supabase.insert_bot_action(
                bot_id=bot_id,
                action_type=ActionType.PAUSE,
                performed_by=performed_by,
                success=False,
                error_message=str(e)
            )
            
            return False
    
    async def stop_bot(
        self,
        bot_id: str,
        performed_by: str,
        reason: Optional[str] = None
    ) -> bool:
        """Stop a bot completely."""
        try:
            # Update state
            state_manager = BotStateManager(bot_id)
            state_updated = await state_manager.update_status(BotStatus.STOPPED)
            
            # Record action in state
            await state_manager.record_action(
                ActionType.STOP,
                {"reason": reason} if reason else None,
                performed_by
            )
            
            # Update main bots table
            stopped_at = datetime.now(timezone.utc)
            self.supabase.update_bot_status(bot_id, BotStatus.STOPPED, stopped_at)
            
            # Log action in database
            self.supabase.insert_bot_action(
                bot_id=bot_id,
                action_type=ActionType.STOP,
                performed_by=performed_by,
                details={"reason": reason} if reason else None,
                success=True
            )
            
            logger.info(f"🛑 Stopped bot {bot_id} by {performed_by}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to stop bot {bot_id}: {e}")
            
            # Log failed action
            self.supabase.insert_bot_action(
                bot_id=bot_id,
                action_type=ActionType.STOP,
                performed_by=performed_by,
                success=False,
                error_message=str(e)
            )
            
            return False
    
    async def clear_orders_and_positions(
        self,
        bot_id: str,
        performed_by: str,
        clear_orders: bool = True,
        clear_positions: bool = True
    ) -> bool:
        """Clear bot orders and/or positions."""
        try:
            action_type = ActionType.CLEAR_ALL
            if clear_orders and not clear_positions:
                action_type = ActionType.CLEAR_ORDERS
            elif clear_positions and not clear_orders:
                action_type = ActionType.CLEAR_POSITIONS
            
            # Update state
            state_manager = BotStateManager(bot_id)
            updates = {}
            if clear_orders:
                updates["active_orders"] = 0
            if clear_positions:
                updates["open_positions"] = 0
            
            state_updated = await state_manager.update_trading_metrics(**updates)
            
            # Record action in state
            await state_manager.record_action(
                action_type,
                {
                    "clear_orders": clear_orders,
                    "clear_positions": clear_positions
                },
                performed_by
            )
            
            # Update main bots table
            if updates:
                self.supabase.update_bot_metrics(bot_id, **updates)
            
            # Log action in database
            self.supabase.insert_bot_action(
                bot_id=bot_id,
                action_type=action_type,
                performed_by=performed_by,
                details={
                    "clear_orders": clear_orders,
                    "clear_positions": clear_positions
                },
                success=True
            )
            
            logger.info(f"🧹 Cleared {'orders' if clear_orders else ''} {'and' if clear_orders and clear_positions else ''} {'positions' if clear_positions else ''} for bot {bot_id}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to clear orders/positions for bot {bot_id}: {e}")
            
            # Log failed action
            self.supabase.insert_bot_action(
                bot_id=bot_id,
                action_type=action_type,
                performed_by=performed_by,
                success=False,
                error_message=str(e)
            )
            
            return False
    
    async def resume_bot(
        self,
        bot_id: str,
        performed_by: str
    ) -> bool:
        """Resume a paused bot."""
        try:
            # Update state
            state_manager = BotStateManager(bot_id)
            state_updated = await state_manager.update_status(BotStatus.RUNNING)
            
            # Record action in state
            await state_manager.record_action(
                ActionType.RESUME,
                None,
                performed_by
            )
            
            # Update main bots table
            self.supabase.update_bot_status(bot_id, BotStatus.RUNNING)
            
            # Log action in database
            self.supabase.insert_bot_action(
                bot_id=bot_id,
                action_type=ActionType.RESUME,
                performed_by=performed_by,
                success=True
            )
            
            logger.info(f"▶️ Resumed bot {bot_id} by {performed_by}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to resume bot {bot_id}: {e}")
            
            # Log failed action
            self.supabase.insert_bot_action(
                bot_id=bot_id,
                action_type=ActionType.RESUME,
                performed_by=performed_by,
                success=False,
                error_message=str(e)
            )
            
            return False
    
    async def get_bot_state(self, bot_id: str) -> Optional[Dict[str, Any]]:
        """Get bot state from Supabase with fallback."""
        try:
            # Try bot_state table first (Redis-like)
            state_manager = BotStateManager(bot_id)
            state = await state_manager.get_state()
            
            if state:
                state["data_source"] = "bot_state"
                return state
            
            # Fallback to main bots table
            bot = self.supabase.get_bot(bot_id)
            
            if bot:
                # Convert to state format
                state = {
                    "bot_id": bot["bot_id"],
                    "custom_name": bot.get("custom_name"),
                    "status": bot["status"],
                    "instrument": bot["instrument"],
                    "account_name": bot["account_name"],
                    "accounts_ids": bot.get("accounts_ids"),
                    "start_time": bot["start_time"],
                    "last_health_check": bot["last_health_check"],
                    "stopped_at": bot.get("stopped_at"),
                    "total_pnl": bot.get("total_pnl", 0.0),
                    "open_positions": bot.get("open_positions", 0),
                    "closed_positions": bot.get("closed_positions", 0),
                    "active_orders": bot.get("active_orders", 0),
                    "won_orders": bot.get("won_orders", 0),
                    "lost_orders": bot.get("lost_orders", 0),
                    "config": bot.get("config"),
                    "data_source": "bots_table"
                }
                return state
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Failed to get state for bot {bot_id}: {e}")
            return None
    
    async def get_all_bots(self) -> List[Dict[str, Any]]:
        """Get all bots from Supabase."""
        try:
            # Get from bot_state table (active bots)
            state_bots = await BotStateManager.get_all_bots()
            state_bot_ids = {bot["bot_id"] for bot in state_bots}
            
            # Mark source
            for bot in state_bots:
                bot["data_source"] = "bot_state"
            
            # Get from main bots table
            db_bots = self.supabase.get_all_bots()
            
            # Merge results (state takes priority)
            all_bots = state_bots.copy()
            
            for db_bot in db_bots:
                if db_bot["bot_id"] not in state_bot_ids:
                    # Convert to state format
                    bot_state = {
                        "bot_id": db_bot["bot_id"],
                        "custom_name": db_bot.get("custom_name"),
                        "status": db_bot["status"],
                        "instrument": db_bot["instrument"],
                        "account_name": db_bot["account_name"],
                        "accounts_ids": db_bot.get("accounts_ids"),
                        "start_time": db_bot["start_time"],
                        "last_health_check": db_bot["last_health_check"],
                        "stopped_at": db_bot.get("stopped_at"),
                        "total_pnl": db_bot.get("total_pnl", 0.0),
                        "open_positions": db_bot.get("open_positions", 0),
                        "closed_positions": db_bot.get("closed_positions", 0),
                        "active_orders": db_bot.get("active_orders", 0),
                        "won_orders": db_bot.get("won_orders", 0),
                        "lost_orders": db_bot.get("lost_orders", 0),
                        "data_source": "bots_table"
                    }
                    all_bots.append(bot_state)
            
            return all_bots
            
        except Exception as e:
            logger.error(f"❌ Failed to get all bots: {e}")
            return []
    
    async def get_bot_actions(
        self,
        bot_id: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get bot action history from database."""
        try:
            return self.supabase.get_bot_actions(bot_id, limit)
            
        except Exception as e:
            logger.error(f"❌ Failed to get actions for bot {bot_id}: {e}")
            return []
    
    async def save_bot_metrics(
        self,
        bot_id: str,
        metrics: Dict[str, Any]
    ) -> bool:
        """Save bot metrics snapshot to database."""
        try:
            result = self.supabase.insert_bot_metric(bot_id, metrics)
            if result:
                logger.debug(f"📊 Saved metrics snapshot for bot {bot_id}")
                return True
            return False
            
        except Exception as e:
            logger.error(f"❌ Failed to save metrics for bot {bot_id}: {e}")
            return False
    
    async def get_bot_metrics(
        self,
        bot_id: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get bot metrics history from database."""
        try:
            return self.supabase.get_bot_metrics(bot_id, limit)
            
        except Exception as e:
            logger.error(f"❌ Failed to get metrics for bot {bot_id}: {e}")
            return []
