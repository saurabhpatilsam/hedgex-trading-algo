"""
Supabase operations for bot management.
Following the same pattern as orca_supabase.py
"""
import json
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from supabase import Client
from app.services.orca_supabase.orca_supabase import SUPABASE
from app.utils.logging_setup import logger


class BotSupabase:
    """Supabase operations for bot management."""
    
    @staticmethod
    def insert_bot(
        bot_id: str,
        instrument: str,
        account_name: str,
        accounts_ids: Optional[str] = None,
        custom_name: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        created_by: str = "system"
    ) -> Optional[Dict[str, Any]]:
        """Insert a new bot into Supabase."""
        try:
            record = {
                "bot_id": bot_id,
                "custom_name": custom_name,
                "instrument": instrument,
                "account_name": account_name,
                "accounts_ids": accounts_ids,
                "status": "initializing",
                "config": config,
                "created_by": created_by,
                "start_time": datetime.now(timezone.utc).isoformat(),
                "last_health_check": datetime.now(timezone.utc).isoformat(),
            }
            
            response = SUPABASE.table("bots").insert(record).execute()
            
            if response.data:
                logger.info(f"✅ Successfully inserted bot Name: {custom_name} id: {bot_id} into bots table")
                return response.data[0]
            else:
                logger.error(f"No data returned when inserting bot Name: {custom_name} id:  {bot_id}")
                return None
            
        except Exception as e:
            logger.error(f"Failed to insert bot Name: {custom_name} id: : {e}")
            return None
    
    @staticmethod
    def update_bot_status(
        bot_id: str,
        status: str,
        stopped_at: Optional[datetime] = None
    ) -> Optional[Dict[str, Any]]:
        """Update bot status in Supabase."""
        try:
            update_data = {
                "status": status,
                "last_health_check": datetime.now(timezone.utc).isoformat(),
            }
            
            if stopped_at:
                update_data["stopped_at"] = stopped_at.isoformat()
            
            response = (
                SUPABASE.table("bots")
                .update(update_data)
                .eq("bot_id", bot_id)
                .execute()
            )
            return response.data[0] if response.data else None
            
        except Exception as e:
            logger.error(f"Failed to update bot {bot_id} status: {e}")
            return None
    
    @staticmethod
    def update_bot_metrics(
        bot_id: str,
        **metrics
    ) -> Optional[Dict[str, Any]]:
        """Update bot trading metrics."""
        try:
            update_data = {
                "last_health_check": datetime.now(timezone.utc).isoformat(),
            }
            
            # Add any provided metrics
            for key, value in metrics.items():
                if key in ["total_pnl", "open_positions", "closed_positions", 
                          "active_orders", "won_orders", "lost_orders"]:
                    update_data[key] = value
            
            response = (
                SUPABASE.table("bots")
                .update(update_data)
                .eq("bot_id", bot_id)
                .execute()
            )
            return response.data[0] if response.data else None
            
        except Exception as e:
            logger.error(f"Failed to update bot {bot_id} metrics: {e}")
            return None
    
    @staticmethod
    def get_bot(bot_id: str) -> Optional[Dict[str, Any]]:
        """Get bot details from Supabase."""
        try:
            response = (
                SUPABASE.table("bots")
                .select("*")
                .eq("bot_id", bot_id)
                .execute()
            )
            return response.data[0] if response.data else None
            
        except Exception as e:
            logger.error(f"Failed to get bot {bot_id}: {e}")
            return None
    
    @staticmethod
    def get_all_bots(status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all bots, optionally filtered by status."""
        try:
            query = SUPABASE.table("bots").select("*").order("created_at", desc=True)
            
            if status_filter:
                query = query.eq("status", status_filter)
            
            response = query.execute()
            return response.data or []
            
        except Exception as e:
            logger.error(f"Failed to get all bots: {e}")
            return []
    
    @staticmethod
    def insert_bot_action(
        bot_id: str,
        action_type: str,
        performed_by: str = "system",
        details: Optional[Dict[str, Any]] = None,
        success: bool = True,
        error_message: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Insert a bot action record."""
        try:
            record = {
                "bot_id": bot_id,
                "action_type": action_type,
                "performed_by": performed_by,
                "details": details,
                "success": success,
                "error_message": error_message,
            }
            
            response = SUPABASE.table("bot_actions").insert(record).execute()
            return response.data[0] if response.data else None
            
        except Exception as e:
            logger.error(f"Failed to insert bot action for {bot_id}: {e}")
            return None
    
    @staticmethod
    def get_bot_actions(
        bot_id: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get bot action history."""
        try:
            response = (
                SUPABASE.table("bot_actions")
                .select("*")
                .eq("bot_id", bot_id)
                .order("timestamp", desc=True)
                .limit(limit)
                .execute()
            )
            return response.data or []
            
        except Exception as e:
            logger.error(f"Failed to get bot actions for {bot_id}: {e}")
            return []
    
    @staticmethod
    def insert_bot_metric(
        bot_id: str,
        metrics: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Insert a bot metrics snapshot."""
        try:
            record = {
                "bot_id": bot_id,
                "total_pnl": metrics.get("total_pnl", 0.0),
                "open_positions": metrics.get("open_positions", 0),
                "closed_positions": metrics.get("closed_positions", 0),
                "active_orders": metrics.get("active_orders", 0),
                "won_orders": metrics.get("won_orders", 0),
                "lost_orders": metrics.get("lost_orders", 0),
                "win_rate": metrics.get("win_rate"),
                "avg_win": metrics.get("avg_win"),
                "avg_loss": metrics.get("avg_loss"),
                "sharpe_ratio": metrics.get("sharpe_ratio"),
                "max_drawdown": metrics.get("max_drawdown"),
            }
            
            response = SUPABASE.table("bot_metrics").insert(record).execute()
            return response.data[0] if response.data else None
            
        except Exception as e:
            logger.error(f"Failed to insert bot metric for {bot_id}: {e}")
            return None
    
    @staticmethod
    def get_bot_metrics(
        bot_id: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get bot metrics history."""
        try:
            response = (
                SUPABASE.table("bot_metrics")
                .select("*")
                .eq("bot_id", bot_id)
                .order("timestamp", desc=True)
                .limit(limit)
                .execute()
            )
            return response.data or []
            
        except Exception as e:
            logger.error(f"Failed to get bot metrics for {bot_id}: {e}")
            return []
    
    # ===== Bot State Operations (Redis-like with Supabase) =====
    
    @staticmethod
    def upsert_bot_state(
        bot_id: str,
        state: Dict[str, Any]
    ) -> bool:
        """Upsert bot state with automatic expiry (24 hours)."""
        try:
            # Use Supabase upsert functionality
            record = {
                "bot_id": bot_id,
                "state": state,
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
            }
            
            response = (
                SUPABASE.table("bot_state")
                .upsert(record, on_conflict="bot_id")
                .execute()
            )
            
            return bool(response.data)
            
        except Exception as e:
            logger.error(f"Failed to upsert bot state for {bot_id}: {e}")
            return False
    
    @staticmethod
    def get_bot_state(bot_id: str) -> Optional[Dict[str, Any]]:
        """Get bot state from Supabase (if not expired)."""
        try:
            response = (
                SUPABASE.table("bot_state")
                .select("*")
                .eq("bot_id", bot_id)
                .gt("expires_at", datetime.now(timezone.utc).isoformat())
                .execute()
            )
            
            if response.data:
                return response.data[0]["state"]
            return None
            
        except Exception as e:
            logger.error(f"Failed to get bot state for {bot_id}: {e}")
            return None
    
    @staticmethod
    def delete_bot_state(bot_id: str) -> bool:
        """Delete bot state from Supabase."""
        try:
            response = (
                SUPABASE.table("bot_state")
                .delete()
                .eq("bot_id", bot_id)
                .execute()
            )
            return bool(response.data)
            
        except Exception as e:
            logger.error(f"Failed to delete bot state for {bot_id}: {e}")
            return False
    
    @staticmethod
    def extend_bot_state_ttl(bot_id: str) -> bool:
        """Extend the TTL of bot state to 24 hours from now."""
        try:
            update_data = {
                "expires_at": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
                "last_updated": datetime.now(timezone.utc).isoformat(),
            }
            
            response = (
                SUPABASE.table("bot_state")
                .update(update_data)
                .eq("bot_id", bot_id)
                .execute()
            )
            return bool(response.data)
            
        except Exception as e:
            logger.error(f"Failed to extend TTL for bot {bot_id}: {e}")
            return False
    
    @staticmethod
    def get_all_bot_states() -> List[Dict[str, Any]]:
        """Get all non-expired bot states."""
        try:
            response = (
                SUPABASE.table("bot_state")
                .select("*")
                .gt("expires_at", datetime.now(timezone.utc).isoformat())
                .execute()
            )
            
            # Return just the state objects
            return [item["state"] for item in response.data] if response.data else []
            
        except Exception as e:
            logger.error(f"Failed to get all bot states: {e}")
            return []
    
    @staticmethod
    def clean_expired_states() -> int:
        """Clean up expired bot states."""
        try:
            response = (
                SUPABASE.table("bot_state")
                .delete()
                .lt("expires_at", datetime.now(timezone.utc).isoformat())
                .execute()
            )
            count = len(response.data) if response.data else 0
            if count > 0:
                logger.info(f"Cleaned {count} expired bot states")
            return count
            
        except Exception as e:
            logger.error(f"Failed to clean expired states: {e}")
            return 0
    
    # ===== Archive Operations =====
    
    @staticmethod
    def archive_bot(
        bot_id: str,
        archived_by: str,
        archive_reason: str
    ) -> Optional[Dict[str, Any]]:
        """Archive a bot by moving it from bots to archived_bots table."""
        try:
            # Get bot data
            bot = BotSupabase.get_bot(bot_id)
            if not bot:
                logger.error(f"Bot {bot_id} not found for archiving")
                return None
            
            # Calculate runtime
            start_time = datetime.fromisoformat(bot["start_time"].replace('Z', '+00:00')) if isinstance(bot["start_time"], str) else bot["start_time"]
            stopped_at = datetime.fromisoformat(bot["stopped_at"].replace('Z', '+00:00')) if bot.get("stopped_at") and isinstance(bot["stopped_at"], str) else bot.get("stopped_at")
            end_time = stopped_at if stopped_at else datetime.now(timezone.utc)
            runtime_seconds = int((end_time - start_time).total_seconds())
            
            # Calculate win rate if we have data
            win_rate = None
            if bot.get("won_orders") and bot.get("lost_orders"):
                total_trades = bot["won_orders"] + bot["lost_orders"]
                if total_trades > 0:
                    win_rate = round((bot["won_orders"] / total_trades) * 100, 2)
            
            # Create archived bot record
            archived_bot = {
                "bot_id": bot_id,
                "bot_type": "orcamax",
                "custom_name": bot.get("custom_name"),
                "instrument": bot["instrument"],
                "account_name": bot["account_name"],
                "accounts_ids": bot.get("accounts_ids"),
                "final_status": bot["status"],
                "final_pnl": float(bot.get("total_pnl", 0.0)),
                "total_runtime_seconds": runtime_seconds,
                "archived_by": archived_by,
                "archive_reason": archive_reason,
                "start_time": bot["start_time"],
                "last_health_check": bot["last_health_check"],
                "stopped_at": bot.get("stopped_at"),
                "closed_positions": bot.get("closed_positions", 0),
                "open_positions": bot.get("open_positions", 0),
                "active_orders": bot.get("active_orders", 0),
                "won_orders": bot.get("won_orders", 0),
                "lost_orders": bot.get("lost_orders", 0),
                "win_rate": win_rate,
                "config": bot.get("config"),
                "created_by": bot.get("created_by", "system")
            }
            
            # Insert into archived_bots
            response = SUPABASE.table("archived_bots").insert(archived_bot).execute()
            
            if response.data:
                # Log audit action
                BotSupabase.insert_audit_log(
                    bot_id=bot_id,
                    action="archive",
                    performed_by=archived_by,
                    reason=archive_reason,
                    metadata={"final_pnl": archived_bot["final_pnl"]}
                )
                
                logger.info(f"✅ Successfully archived bot {bot_id}")
                return response.data[0]
            else:
                logger.error(f"Failed to insert archived bot {bot_id}")
                return None
            
        except Exception as e:
            logger.error(f"Failed to archive bot {bot_id}: {e}")
            return None
    
    @staticmethod
    def get_archived_bot(bot_id: str) -> Optional[Dict[str, Any]]:
        """Get archived bot details."""
        try:
            response = (
                SUPABASE.table("archived_bots")
                .select("*")
                .eq("bot_id", bot_id)
                .execute()
            )
            return response.data[0] if response.data else None
            
        except Exception as e:
            logger.error(f"Failed to get archived bot {bot_id}: {e}")
            return None
    
    @staticmethod
    def get_all_archived_bots(
        archive_reason: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Get all archived bots with optional filtering."""
        try:
            query = (
                SUPABASE.table("archived_bots")
                .select("*")
                .order("archived_at", desc=True)
                .range(offset, offset + limit - 1)
            )
            
            if archive_reason:
                query = query.eq("archive_reason", archive_reason)
            
            response = query.execute()
            return response.data or []
            
        except Exception as e:
            logger.error(f"Failed to get archived bots: {e}")
            return []
    
    @staticmethod
    def unarchive_bot(bot_id: str, performed_by: str) -> Optional[Dict[str, Any]]:
        """Move bot from archived_bots back to active bots (stopped state)."""
        try:
            # Get archived bot
            archived_bot = BotSupabase.get_archived_bot(bot_id)
            if not archived_bot:
                logger.error(f"Archived bot {bot_id} not found")
                return None
            
            # Create active bot record (in stopped state)
            bot_record = {
                "bot_id": bot_id,
                "custom_name": archived_bot.get("custom_name"),
                "instrument": archived_bot["instrument"],
                "account_name": archived_bot["account_name"],
                "accounts_ids": archived_bot.get("accounts_ids"),
                "status": "stopped",
                "start_time": archived_bot["start_time"],
                "last_health_check": datetime.now(timezone.utc).isoformat(),
                "stopped_at": archived_bot.get("stopped_at"),
                "total_pnl": archived_bot.get("final_pnl", 0.0),
                "open_positions": 0,
                "closed_positions": archived_bot.get("closed_positions", 0),
                "active_orders": 0,
                "won_orders": archived_bot.get("won_orders", 0),
                "lost_orders": archived_bot.get("lost_orders", 0),
                "config": archived_bot.get("config"),
                "created_by": archived_bot.get("created_by", "system")
            }
            
            # Insert back into bots table
            response = SUPABASE.table("bots").insert(bot_record).execute()
            
            if response.data:
                # Delete from archived_bots
                SUPABASE.table("archived_bots").delete().eq("bot_id", bot_id).execute()
                
                # Log audit action
                BotSupabase.insert_audit_log(
                    bot_id=bot_id,
                    action="unarchive",
                    performed_by=performed_by
                )
                
                logger.info(f"✅ Successfully unarchived bot {bot_id}")
                return response.data[0]
            else:
                logger.error(f"Failed to unarchive bot {bot_id}")
                return None
            
        except Exception as e:
            logger.error(f"Failed to unarchive bot {bot_id}: {e}")
            return None
    
    @staticmethod
    def delete_archived_bot(bot_id: str, performed_by: str) -> bool:
        """Permanently delete an archived bot."""
        try:
            # Log before deletion
            BotSupabase.insert_audit_log(
                bot_id=bot_id,
                action="delete",
                performed_by=performed_by,
                metadata={"permanent": True}
            )
            
            response = (
                SUPABASE.table("archived_bots")
                .delete()
                .eq("bot_id", bot_id)
                .execute()
            )
            
            success = bool(response.data)
            if success:
                logger.info(f"✅ Successfully deleted archived bot {bot_id}")
            return success
            
        except Exception as e:
            logger.error(f"Failed to delete archived bot {bot_id}: {e}")
            return False
    
    @staticmethod
    def delete_active_bot(bot_id: str, performed_by: str) -> bool:
        """Permanently delete an active bot."""
        try:
            # Log before deletion
            BotSupabase.insert_audit_log(
                bot_id=bot_id,
                action="delete",
                performed_by=performed_by,
                metadata={"permanent": True, "source": "active"}
            )
            
            # Delete from bot_state first (if exists)
            BotSupabase.delete_bot_state(bot_id)
            
            # Delete from bots table
            response = (
                SUPABASE.table("bots")
                .delete()
                .eq("bot_id", bot_id)
                .execute()
            )
            
            success = bool(response.data)
            if success:
                logger.info(f"✅ Successfully deleted active bot {bot_id}")
            return success
            
        except Exception as e:
            logger.error(f"Failed to delete active bot {bot_id}: {e}")
            return False
    
    # ===== Configuration Operations =====
    
    @staticmethod
    def insert_bot_configuration(
        config_id: str,
        name: str,
        bot_type: str,
        config: Dict[str, Any],
        created_by: str,
        description: Optional[str] = None,
        tags: Optional[List[str]] = None,
        is_template: bool = False,
        is_shared: bool = False
    ) -> Optional[Dict[str, Any]]:
        """Save a bot configuration."""
        try:
            record = {
                "config_id": config_id,
                "name": name,
                "description": description,
                "bot_type": bot_type,
                "config": config,
                "tags": tags or [],
                "created_by": created_by,
                "is_template": is_template,
                "is_shared": is_shared,
                "status": "active"
            }
            
            response = SUPABASE.table("bot_configurations").insert(record).execute()
            
            if response.data:
                logger.info(f"✅ Successfully saved configuration {name} ({config_id})")
                return response.data[0]
            else:
                logger.error(f"Failed to save configuration {name}")
                return None
            
        except Exception as e:
            logger.error(f"Failed to insert bot configuration: {e}")
            return None
    
    @staticmethod
    def get_bot_configuration(config_id: str) -> Optional[Dict[str, Any]]:
        """Get a bot configuration by ID."""
        try:
            response = (
                SUPABASE.table("bot_configurations")
                .select("*")
                .eq("config_id", config_id)
                .execute()
            )
            return response.data[0] if response.data else None
            
        except Exception as e:
            logger.error(f"Failed to get bot configuration {config_id}: {e}")
            return None
    
    @staticmethod
    def get_all_bot_configurations(
        bot_type: Optional[str] = None,
        created_by: Optional[str] = None,
        status: str = "active",
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get all bot configurations with optional filtering."""
        try:
            query = (
                SUPABASE.table("bot_configurations")
                .select("*")
                .eq("status", status)
                .order("created_at", desc=True)
                .limit(limit)
            )
            
            if bot_type:
                query = query.eq("bot_type", bot_type)
            
            if created_by:
                query = query.eq("created_by", created_by)
            
            response = query.execute()
            return response.data or []
            
        except Exception as e:
            logger.error(f"Failed to get bot configurations: {e}")
            return []
    
    @staticmethod
    def update_bot_configuration(
        config_id: str,
        **updates
    ) -> Optional[Dict[str, Any]]:
        """Update a bot configuration."""
        try:
            update_data = {}
            allowed_fields = [
                "name", "description", "config", "tags", "is_template",
                "is_shared", "is_favorite", "status", "times_used",
                "last_used", "success_rate", "total_pnl", "performance_metrics"
            ]
            
            for key, value in updates.items():
                if key in allowed_fields:
                    update_data[key] = value
            
            if not update_data:
                return None
            
            response = (
                SUPABASE.table("bot_configurations")
                .update(update_data)
                .eq("config_id", config_id)
                .execute()
            )
            
            return response.data[0] if response.data else None
            
        except Exception as e:
            logger.error(f"Failed to update bot configuration {config_id}: {e}")
            return None
    
    @staticmethod
    def delete_bot_configuration(config_id: str) -> bool:
        """Delete a bot configuration."""
        try:
            response = (
                SUPABASE.table("bot_configurations")
                .delete()
                .eq("config_id", config_id)
                .execute()
            )
            
            success = bool(response.data)
            if success:
                logger.info(f"✅ Successfully deleted configuration {config_id}")
            return success
            
        except Exception as e:
            logger.error(f"Failed to delete bot configuration {config_id}: {e}")
            return False
    
    @staticmethod
    def increment_configuration_usage(config_id: str) -> bool:
        """Increment the times_used counter for a configuration."""
        try:
            # Get current config
            config = BotSupabase.get_bot_configuration(config_id)
            if not config:
                return False
            
            times_used = config.get("times_used", 0) + 1
            
            update_data = {
                "times_used": times_used,
                "last_used": datetime.now(timezone.utc).isoformat()
            }
            
            response = (
                SUPABASE.table("bot_configurations")
                .update(update_data)
                .eq("config_id", config_id)
                .execute()
            )
            
            return bool(response.data)
            
        except Exception as e:
            logger.error(f"Failed to increment configuration usage for {config_id}: {e}")
            return False
    
    # ===== Audit Log Operations =====
    
    @staticmethod
    def insert_audit_log(
        bot_id: str,
        action: str,
        performed_by: str,
        reason: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """Insert an audit log entry."""
        try:
            record = {
                "bot_id": bot_id,
                "action": action,
                "performed_by": performed_by,
                "reason": reason,
                "metadata": metadata
            }
            
            response = SUPABASE.table("bot_audit_log").insert(record).execute()
            return response.data[0] if response.data else None
            
        except Exception as e:
            logger.error(f"Failed to insert audit log for {bot_id}: {e}")
            return None
    
    @staticmethod
    def get_audit_logs(
        bot_id: Optional[str] = None,
        action: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get audit logs with optional filtering."""
        try:
            query = (
                SUPABASE.table("bot_audit_log")
                .select("*")
                .order("timestamp", desc=True)
                .limit(limit)
            )
            
            if bot_id:
                query = query.eq("bot_id", bot_id)
            
            if action:
                query = query.eq("action", action)
            
            response = query.execute()
            return response.data or []
            
        except Exception as e:
            logger.error(f"Failed to get audit logs: {e}")
            return []
