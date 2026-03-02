"""
FastAPI routes for bot management.
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from app.services.bot_control.bot_control_service_supabase import BotControlService
from app.schemas.bot_schemas import (
    BotStateResponse, BotListResponse, BotDetailResponse,
    BotControlRequest, BotActionResponse, BotMetricResponse,
    ControlActionResponse, HealthCheckResponse, BotStatus,
    ArchiveBotRequest, ArchivedBotResponse, ArchiveSuccessResponse,
    ArchivedBotsListResponse, RestartBotRequest, RestartBotResponse,
    BotDetailsResponse, DeleteBotResponse, BotConfigurationRequest,
    BotConfigurationResponse, BotConfigurationsListResponse, 
    SaveConfigurationResponse, ArchiveReason
)
# Redis client no longer needed - using Supabase
# from app.services.redis.redis_client import redis_client
from app.services.orca_supabase.bot_supabase import BotSupabase
from app.api.dependencies import get_current_confirmed_user
from app.services.auth.models import UserResponse
from app.utils.logging_setup import logger
from datetime import datetime, timezone



bot_router = APIRouter(prefix="/bots", tags=["Bot Management"])

# Cache for GET /api/bots/ to handle frontend polling efficiently
_bots_list_cache = {"data": None, "timestamp": None}
BOTS_CACHE_TTL_SECONDS = 3  # 3 second cache for live bot list


@bot_router.get("/", response_model=BotListResponse)
async def get_all_bots(
    status: Optional[BotStatus] = Query(None, description="Filter by status"),
    current_user: UserResponse = Depends(get_current_confirmed_user)
) -> BotListResponse:
    """
    Get a list of all bots with summarized state.
    Optimized for frontend polling with 3-second cache.
    Prefers Redis data if available, falls back to DB if Redis key missing.
    
    This is the PRIMARY endpoint for live bot status updates.
    Frontend should poll this endpoint every 10 seconds for dashboard updates.
    """
    try:
        # Check cache if no status filter (most common case for polling)
        cache_key = f"status_{status}" if status else "all"
        now = datetime.now(timezone.utc)
        
        if (status is None and 
            _bots_list_cache["data"] is not None and 
            _bots_list_cache["timestamp"] is not None and
            (now - _bots_list_cache["timestamp"]).total_seconds() < BOTS_CACHE_TTL_SECONDS):
            # Return cached data with cache hit header
            logger.debug(f"Cache HIT for /api/bots/")
            cached_response = _bots_list_cache["data"]
            # Add timestamp to show data freshness
            cached_response.timestamp = now
            return cached_response
        
        logger.debug(f"Cache MISS for /api/bots/ - fetching fresh data")
        
        service = BotControlService()
        all_bots = await service.get_all_bots()
        
        # Filter by status if provided
        if status:
            all_bots = [bot for bot in all_bots if bot.get("status") == status]
        
        # Calculate statistics
        total = len(all_bots)
        active = sum(1 for bot in all_bots if bot.get("status") == BotStatus.RUNNING)
        paused = sum(1 for bot in all_bots if bot.get("status") == BotStatus.PAUSED)
        stopped = sum(1 for bot in all_bots if bot.get("status") == BotStatus.STOPPED)
        error = sum(1 for bot in all_bots if bot.get("status") == BotStatus.ERROR)
        
        # Convert to response models
        bot_responses = []
        for bot in all_bots:
            # Handle datetime conversion
            bot_response = BotStateResponse(
                bot_id=bot["bot_id"],
                custom_name=bot.get("custom_name"),
                status=bot["status"],
                instrument=bot["instrument"],
                account_name=bot["account_name"],
                accounts_ids=bot.get("accounts_ids"),
                start_time=bot["start_time"] if isinstance(bot["start_time"], datetime) else datetime.fromisoformat(bot["start_time"]),
                last_health_check=bot["last_health_check"] if isinstance(bot["last_health_check"], datetime) else datetime.fromisoformat(bot["last_health_check"]),
                stopped_at=bot.get("stopped_at") if isinstance(bot.get("stopped_at"), datetime) else (datetime.fromisoformat(bot["stopped_at"]) if bot.get("stopped_at") else None),
                total_pnl=bot.get("total_pnl", 0.0),
                open_positions=bot.get("open_positions", 0),
                closed_positions=bot.get("closed_positions", 0),
                active_orders=bot.get("active_orders", 0),
                won_orders=bot.get("won_orders", 0),
                lost_orders=bot.get("lost_orders", 0),
                data_source=bot.get("data_source", "unknown")
            )
            bot_responses.append(bot_response)
        
        response = BotListResponse(
            bots=bot_responses,
            total=total,
            active=active,
            paused=paused,
            stopped=stopped,
            error=error,
            timestamp=now
        )
        
        # Update cache if no filter
        if status is None:
            _bots_list_cache["data"] = response
            _bots_list_cache["timestamp"] = now
        
        return response
        
    except Exception as e:
        logger.error(f"Error getting bots: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@bot_router.get("/archived", response_model=ArchivedBotsListResponse)
async def get_archived_bots(
        archive_reason: Optional[ArchiveReason] = Query(None, description="Filter by archive reason"),
        limit: int = Query(50, ge=1, le=100, description="Number of results"),
        offset: int = Query(0, ge=0, description="Offset for pagination"),
        current_user: UserResponse = Depends(get_current_confirmed_user)
) -> ArchivedBotsListResponse:
    """
    Retrieve all archived bots for display in Archived Bots tab.
    """
    try:
        archived_bots = BotSupabase.get_all_archived_bots(
            archive_reason=archive_reason.value if archive_reason else None,
            limit=limit,
            offset=offset
        )

        # Convert to response models
        bot_responses = []
        for bot in archived_bots:
            bot_response = ArchivedBotResponse(
                bot_id=bot["bot_id"],
                bot_type=bot.get("bot_type", "orcamax"),
                custom_name=bot.get("custom_name"),
                status=bot["final_status"],
                instrument=bot["instrument"],
                account_name=bot["account_name"],
                accounts_ids=bot.get("accounts_ids"),
                archived_at=datetime.fromisoformat(bot["archived_at"].replace('Z', '+00:00')) if isinstance(
                    bot["archived_at"], str) else bot["archived_at"],
                archived_by=bot["archived_by"],
                archive_reason=bot["archive_reason"],
                final_pnl=float(bot.get("final_pnl", 0.0)),
                total_runtime=bot.get("total_runtime_seconds", 0),
                start_time=datetime.fromisoformat(bot["start_time"].replace('Z', '+00:00')) if isinstance(
                    bot["start_time"], str) else bot["start_time"],
                last_health_check=datetime.fromisoformat(bot["last_health_check"].replace('Z', '+00:00')) if isinstance(
                    bot["last_health_check"], str) else bot["last_health_check"],
                stopped_at=datetime.fromisoformat(bot["stopped_at"].replace('Z', '+00:00')) if bot.get(
                    "stopped_at") and isinstance(bot["stopped_at"], str) else bot.get("stopped_at"),
                closed_positions=bot.get("closed_positions", 0),
                open_positions=bot.get("open_positions", 0),
                active_orders=bot.get("active_orders", 0),
                won_orders=bot.get("won_orders", 0),
                lost_orders=bot.get("lost_orders", 0),
                win_rate=bot.get("win_rate"),
                profit_factor=bot.get("profit_factor"),
                sharpe_ratio=bot.get("sharpe_ratio"),
                max_drawdown=bot.get("max_drawdown"),
                config=bot.get("config"),
                fibonacci_levels=bot.get("fibonacci_levels"),
                trading_window_active=bot.get("trading_window_active", False),
                threshold_reached=bot.get("threshold_reached", False)
            )
            bot_responses.append(bot_response)

        return ArchivedBotsListResponse(
            success=True,
            bots=bot_responses,
            total=len(bot_responses),
            timestamp=datetime.now(timezone.utc)
        )

    except Exception as e:
        logger.error(f"Error getting archived bots: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@bot_router.get("/health/check", response_model=HealthCheckResponse)
async def health_check() -> HealthCheckResponse:
    """
    Check health of Redis and Database connections.
    """
    try:
        # Check Supabase connection
        supabase_connected = False
        try:
            # Try a simple query to check connection
            BotSupabase.get_all_bots()
            supabase_connected = True
        except:
            pass

        # Database is Supabase, so same as above
        database_connected = supabase_connected

        # Get bot counts
        service = BotControlService()
        all_bots = await service.get_all_bots()
        total_bots = len(all_bots)
        active_bots = sum(1 for bot in all_bots if bot.get("status") == BotStatus.RUNNING)

        return HealthCheckResponse(
            redis_connected=supabase_connected,  # Using Supabase for state management
            database_connected=database_connected,
            total_bots=total_bots,
            active_bots=active_bots,
            timestamp=datetime.now(timezone.utc)
        )

    except Exception as e:
        logger.error(f"Error in health check: {e}")
        return HealthCheckResponse(
            redis_connected=False,
            database_connected=False,
            total_bots=0,
            active_bots=0,
            timestamp=datetime.now(timezone.utc)
        )



@bot_router.get("/{bot_id}", response_model=BotDetailResponse)
async def get_bot_detail(
    bot_id: str,
    current_user: UserResponse = Depends(get_current_confirmed_user)
) -> BotDetailResponse:
    """
    Get detailed information for one bot (Redis + DB merge).
    """
    try:
        service = BotControlService()
        
        # Get bot state
        bot_state = await service.get_bot_state(bot_id)
        if not bot_state:
            raise HTTPException(status_code=404, detail=f"Bot {bot_id} not found")
        
        # Get recent actions
        actions = await service.get_bot_actions(bot_id, limit=20)
        action_responses = [
            BotActionResponse(
                id=action.id,
                bot_id=action.bot_id,
                action_type=action.action_type,
                performed_by=action.performed_by,
                timestamp=action.timestamp,
                details=action.details,
                success=action.success,
                error_message=action.error_message
            )
            for action in actions
        ]
        
        # Convert bot state
        bot_response = BotStateResponse(
            bot_id=bot_state["bot_id"],
            custom_name=bot_state.get("custom_name"),
            status=bot_state["status"],
            instrument=bot_state["instrument"],
            account_name=bot_state["account_name"],
            accounts_ids=bot_state.get("accounts_ids"),
            start_time=bot_state["start_time"] if isinstance(bot_state["start_time"], datetime) else datetime.fromisoformat(bot_state["start_time"]),
            last_health_check=bot_state["last_health_check"] if isinstance(bot_state["last_health_check"], datetime) else datetime.fromisoformat(bot_state["last_health_check"]),
            stopped_at=bot_state.get("stopped_at") if isinstance(bot_state.get("stopped_at"), datetime) else (datetime.fromisoformat(bot_state["stopped_at"]) if bot_state.get("stopped_at") else None),
            total_pnl=bot_state.get("total_pnl", 0.0),
            open_positions=bot_state.get("open_positions", 0),
            closed_positions=bot_state.get("closed_positions", 0),
            active_orders=bot_state.get("active_orders", 0),
            won_orders=bot_state.get("won_orders", 0),
            lost_orders=bot_state.get("lost_orders", 0),
            data_source=bot_state.get("data_source", "unknown")
        )
        
        return BotDetailResponse(
            bot=bot_response,
            recent_actions=action_responses,
            recent_metrics=[],  # TODO: Implement metrics fetching
            config=bot_state.get("config")
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting bot {bot_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@bot_router.post("/{bot_id}/pause", response_model=ControlActionResponse)
async def pause_bot(
    bot_id: str,
    request: BotControlRequest,
    current_user: UserResponse = Depends(get_current_confirmed_user)
) -> ControlActionResponse:
    """
    Pause the bot, update Redis + DB, log action.
    """
    try:
        service = BotControlService()
        
        # Check if bot exists
        bot_state = await service.get_bot_state(bot_id)
        if not bot_state:
            raise HTTPException(status_code=404, detail=f"Bot {bot_id} not found")
        
        # Check if bot can be paused
        if bot_state["status"] != BotStatus.RUNNING:
            return ControlActionResponse(
                success=False,
                message=f"Cannot pause bot in {bot_state['status']} state",
                bot_id=bot_id,
                action="pause",
                error=f"Bot is not running (current status: {bot_state['status']})"
            )
        
        # Pause the bot
        success = await service.pause_bot(
            bot_id=bot_id,
            performed_by=request.performed_by or current_user.email,
            reason=request.reason
        )
        
        return ControlActionResponse(
            success=success,
            message="Bot paused successfully" if success else "Failed to pause bot",
            bot_id=bot_id,
            action="pause",
            new_status=BotStatus.PAUSED if success else None,
            details={"reason": request.reason} if request.reason else None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error pausing bot {bot_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@bot_router.post("/{bot_id}/stop", response_model=ControlActionResponse)
async def stop_bot(
    bot_id: str,
    request: BotControlRequest,
    current_user: UserResponse = Depends(get_current_confirmed_user)
) -> ControlActionResponse:
    """
    Stop the bot, update Redis + DB, log action.
    """
    try:
        service = BotControlService()
        
        # Check if bot exists
        bot_state = await service.get_bot_state(bot_id)
        if not bot_state:
            raise HTTPException(status_code=404, detail=f"Bot {bot_id} not found")
        
        # Check if bot is already stopped
        if bot_state["status"] == BotStatus.STOPPED:
            return ControlActionResponse(
                success=False,
                message="Bot is already stopped",
                bot_id=bot_id,
                action="stop",
                error="Bot is already in stopped state"
            )
        
        # Stop the bot
        success = await service.stop_bot(
            bot_id=bot_id,
            performed_by=request.performed_by or current_user.email,
            reason=request.reason
        )
        
        return ControlActionResponse(
            success=success,
            message="Bot stopped successfully" if success else "Failed to stop bot",
            bot_id=bot_id,
            action="stop",
            new_status=BotStatus.STOPPED if success else None,
            details={"reason": request.reason} if request.reason else None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping bot {bot_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@bot_router.post("/{bot_id}/resume", response_model=ControlActionResponse)
async def resume_bot(
    bot_id: str,
    request: BotControlRequest,
    current_user: UserResponse = Depends(get_current_confirmed_user)
) -> ControlActionResponse:
    """
    Resume a paused bot.
    """
    try:
        service = BotControlService()
        
        # Check if bot exists
        bot_state = await service.get_bot_state(bot_id)
        if not bot_state:
            raise HTTPException(status_code=404, detail=f"Bot {bot_id} not found")
        
        # Check if bot can be resumed
        if bot_state["status"] != BotStatus.PAUSED:
            return ControlActionResponse(
                success=False,
                message=f"Cannot resume bot in {bot_state['status']} state",
                bot_id=bot_id,
                action="resume",
                error=f"Bot is not paused (current status: {bot_state['status']})"
            )
        
        # Resume the bot
        success = await service.resume_bot(
            bot_id=bot_id,
            performed_by=request.performed_by or current_user.email
        )
        
        return ControlActionResponse(
            success=success,
            message="Bot resumed successfully" if success else "Failed to resume bot",
            bot_id=bot_id,
            action="resume",
            new_status=BotStatus.RUNNING if success else None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resuming bot {bot_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@bot_router.post("/{bot_id}/clear", response_model=ControlActionResponse)
async def clear_orders_positions(
    bot_id: str,
    request: BotControlRequest,
    clear_orders: bool = Query(True, description="Clear pending orders"),
    clear_positions: bool = Query(True, description="Clear open positions"),
    current_user: UserResponse = Depends(get_current_confirmed_user)
) -> ControlActionResponse:
    """
    Clear all orders and positions, update Redis + DB, log action.
    """
    try:
        service = BotControlService()
        
        # Check if bot exists
        bot_state = await service.get_bot_state(bot_id)
        if not bot_state:
            raise HTTPException(status_code=404, detail=f"Bot {bot_id} not found")
        
        # Check if bot is stopped
        if bot_state["status"] == BotStatus.STOPPED and not request.force:
            return ControlActionResponse(
                success=False,
                message="Cannot clear orders/positions for stopped bot (use force=true to override)",
                bot_id=bot_id,
                action="clear",
                error="Bot is stopped"
            )
        
        # Clear orders and/or positions
        success = await service.clear_orders_and_positions(
            bot_id=bot_id,
            performed_by=request.performed_by or current_user.email,
            clear_orders=clear_orders,
            clear_positions=clear_positions
        )
        
        action_desc = []
        if clear_orders:
            action_desc.append("orders")
        if clear_positions:
            action_desc.append("positions")
        
        return ControlActionResponse(
            success=success,
            message=f"Cleared {' and '.join(action_desc)} successfully" if success else f"Failed to clear {' and '.join(action_desc)}",
            bot_id=bot_id,
            action="clear",
            details={
                "clear_orders": clear_orders,
                "clear_positions": clear_positions
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error clearing orders/positions for bot {bot_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@bot_router.get("/{bot_id}/actions", response_model=List[BotActionResponse])
async def get_bot_actions(
    bot_id: str,
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of actions to return"),
    current_user: UserResponse = Depends(get_current_confirmed_user)
) -> List[BotActionResponse]:
    """
    Return action history for the bot from DB.
    """
    try:
        service = BotControlService()
        actions = await service.get_bot_actions(bot_id, limit=limit)
        
        return [
            BotActionResponse(
                id=action.get("id"),
                bot_id=action.get("bot_id"),
                action_type=action.get("action_type"),
                performed_by=action.get("performed_by"),
                timestamp=action.get("timestamp"),
                details=action.get("details"),
                success=action.get("success", True),
                error_message=action.get("error_message")
            )
            for action in actions
        ]
        
    except Exception as e:
        logger.error(f"Error getting actions for bot {bot_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@bot_router.get("/{bot_id}/metrics", response_model=List[BotMetricResponse])
async def get_bot_metrics(
    bot_id: str,
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of metrics to return"),
    current_user: UserResponse = Depends(get_current_confirmed_user)
) -> List[BotMetricResponse]:
    """
    Return live and historical metrics for the bot.
    """
    try:
        # TODO: Implement metrics fetching from BotMetric table
        # For now, return empty list
        return []
        
    except Exception as e:
        logger.error(f"Error getting metrics for bot {bot_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))



# ===== ARCHIVE ENDPOINTS =====

@bot_router.post("/{bot_id}/archive", response_model=ArchiveSuccessResponse)
async def archive_bot(
    bot_id: str,
    request: ArchiveBotRequest,
    current_user: UserResponse = Depends(get_current_confirmed_user)
) -> ArchiveSuccessResponse:
    """
    Archive a stopped or errored bot for historical tracking.
    """
    try:
        # Check if bot exists
        bot = BotSupabase.get_bot(bot_id)
        if not bot:
            raise HTTPException(status_code=404, detail=f"Bot {bot_id} not found")
        
        # Optionally stop the bot first if it's still running
        if bot["status"] == BotStatus.RUNNING:
            service = BotControlService()
            await service.stop_bot(
                bot_id=bot_id,
                performed_by=current_user.email,
                reason="Archiving bot"
            )
        
        # Archive the bot
        archived_bot = BotSupabase.archive_bot(
            bot_id=bot_id,
            archived_by=request.archived_by if request.archived_by != "user" else current_user.email,
            archive_reason=request.reason.value
        )
        
        if not archived_bot:
            raise HTTPException(status_code=500, detail="Failed to archive bot")
        
        # Convert to response model
        archived_response = ArchivedBotResponse(
            bot_id=archived_bot["bot_id"],
            bot_type=archived_bot.get("bot_type", "orcamax"),
            custom_name=archived_bot.get("custom_name"),
            status=archived_bot["final_status"],
            instrument=archived_bot["instrument"],
            account_name=archived_bot["account_name"],
            accounts_ids=archived_bot.get("accounts_ids"),
            archived_at=datetime.fromisoformat(archived_bot["archived_at"].replace('Z', '+00:00')) if isinstance(archived_bot["archived_at"], str) else archived_bot["archived_at"],
            archived_by=archived_bot["archived_by"],
            archive_reason=archived_bot["archive_reason"],
            final_pnl=float(archived_bot.get("final_pnl", 0.0)),
            total_runtime=archived_bot.get("total_runtime_seconds", 0),
            start_time=datetime.fromisoformat(archived_bot["start_time"].replace('Z', '+00:00')) if isinstance(archived_bot["start_time"], str) else archived_bot["start_time"],
            last_health_check=datetime.fromisoformat(archived_bot["last_health_check"].replace('Z', '+00:00')) if isinstance(archived_bot["last_health_check"], str) else archived_bot["last_health_check"],
            stopped_at=datetime.fromisoformat(archived_bot["stopped_at"].replace('Z', '+00:00')) if archived_bot.get("stopped_at") and isinstance(archived_bot["stopped_at"], str) else archived_bot.get("stopped_at"),
            closed_positions=archived_bot.get("closed_positions", 0),
            open_positions=archived_bot.get("open_positions", 0),
            active_orders=archived_bot.get("active_orders", 0),
            won_orders=archived_bot.get("won_orders", 0),
            lost_orders=archived_bot.get("lost_orders", 0),
            win_rate=archived_bot.get("win_rate"),
            profit_factor=archived_bot.get("profit_factor"),
            sharpe_ratio=archived_bot.get("sharpe_ratio"),
            max_drawdown=archived_bot.get("max_drawdown"),
            config=archived_bot.get("config"),
            fibonacci_levels=archived_bot.get("fibonacci_levels"),
            trading_window_active=archived_bot.get("trading_window_active", False),
            threshold_reached=archived_bot.get("threshold_reached", False)
        )
        
        return ArchiveSuccessResponse(
            success=True,
            message="Bot archived successfully",
            archived_bot=archived_response
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error archiving bot {bot_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))




@bot_router.post("/{bot_id}/unarchive", response_model=ControlActionResponse)
async def unarchive_bot(
    bot_id: str,
    current_user: UserResponse = Depends(get_current_confirmed_user)
) -> ControlActionResponse:
    """
    Move bot from archived state back to active bots (without starting it).
    """
    try:
        # Unarchive the bot
        unarchived_bot = BotSupabase.unarchive_bot(
            bot_id=bot_id,
            performed_by=current_user.email
        )
        
        if not unarchived_bot:
            raise HTTPException(status_code=404, detail=f"Archived bot {bot_id} not found")
        
        return ControlActionResponse(
            success=True,
            message="Bot unarchived successfully",
            bot_id=bot_id,
            action="unarchive",
            new_status=BotStatus.STOPPED,
            details={"unarchived_at": datetime.now(timezone.utc).isoformat()}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unarchiving bot {bot_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@bot_router.delete("/{bot_id}", response_model=DeleteBotResponse)
async def delete_bot(
    bot_id: str,
    permanent: bool = Query(False, description="Confirm permanent deletion"),
    current_user: UserResponse = Depends(get_current_confirmed_user)
) -> DeleteBotResponse:
    """
    Permanently delete an archived or active bot (irreversible).
    """
    try:
        # ADD THIS CHECK ✅
        if not permanent:
            raise HTTPException(
                status_code=400,
                detail="Must confirm permanent deletion with permanent=true parameter"
            )


        # Try to find in archived bots first
        archived_bot = BotSupabase.get_archived_bot(bot_id)
        
        if archived_bot:
            # Delete from archived_bots
            success = BotSupabase.delete_archived_bot(bot_id, current_user.email)
            if not success:
                raise HTTPException(status_code=500, detail="Failed to delete archived bot")
        else:
            # Try active bots
            active_bot = BotSupabase.get_bot(bot_id)
            if not active_bot:
                raise HTTPException(status_code=404, detail=f"Bot {bot_id} not found")
            
            # Delete from active bots
            success = BotSupabase.delete_active_bot(bot_id, current_user.email)
            if not success:
                raise HTTPException(status_code=500, detail="Failed to delete active bot")
        
        return DeleteBotResponse(
            success=True,
            message="Bot deleted permanently",
            deleted_bot_id=bot_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting bot {bot_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== RESTART ENDPOINT =====

@bot_router.post("/restart", response_model=RestartBotResponse)
async def restart_bot(
    request: RestartBotRequest,
    current_user: UserResponse = Depends(get_current_confirmed_user)
) -> RestartBotResponse:
    """
    Create a new bot instance using configuration from an existing or archived bot.
    """
    try:
        # Validate configuration
        config = request.config
        if not config.get("instrument") or not config.get("account_name"):
            raise HTTPException(
                status_code=400,
                detail="Configuration must include 'instrument' and 'account_name'"
            )
        
        # Generate new bot_id
        import uuid
        import time
        timestamp = int(time.time())
        unique_id = str(uuid.uuid4())[:8]
        new_bot_id = f"orca_max_restart_{timestamp}_{unique_id}"
        
        # Create new bot using BotControlService
        service = BotControlService()
        bot_created = await service.create_bot(
            bot_id=new_bot_id,
            instrument=config["instrument"],
            account_name=config["account_name"],
            accounts_ids=config.get("accounts_ids"),
            custom_name=config.get("custom_name", f"Restarted from {request.bot_id}"),
            config=config,
            created_by=current_user.email
        )
        
        if not bot_created:
            raise HTTPException(status_code=500, detail="Failed to create restarted bot")
        
        # Log restart action
        BotSupabase.insert_audit_log(
            bot_id=new_bot_id,
            action="restart",
            performed_by=current_user.email,
            metadata={
                "source_bot_id": request.bot_id,
                "modified": request.modified
            }
        )
        
        return RestartBotResponse(
            success=True,
            message="Bot restarted successfully",
            bot_id=new_bot_id,
            config=config
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error restarting bot from {request.bot_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== BOT DETAILS ENDPOINT =====

@bot_router.get("/{bot_id}/details", response_model=BotDetailsResponse)
async def get_bot_details(
    bot_id: str,
    include_history: bool = Query(False, description="Include trade history"),
    include_logs: bool = Query(False, description="Include execution logs"),
    history_limit: int = Query(100, ge=1, le=500, description="Limit historical records"),
    current_user: UserResponse = Depends(get_current_confirmed_user)
) -> BotDetailsResponse:
    """
    Get comprehensive details about any bot (active or archived) including all metrics,
    configuration, history, and performance.
    """
    try:
        # Try to get from active bots first
        service = BotControlService()
        bot_state = await service.get_bot_state(bot_id)
        
        is_archived = False
        archived_at = None
        archived_by = None
        archive_reason = None
        
        # If not found in active, check archived
        if not bot_state:
            archived_bot = BotSupabase.get_archived_bot(bot_id)
            if not archived_bot:
                raise HTTPException(status_code=404, detail=f"Bot {bot_id} not found")
            
            is_archived = True
            archived_at = datetime.fromisoformat(archived_bot["archived_at"].replace('Z', '+00:00')) if isinstance(archived_bot["archived_at"], str) else archived_bot["archived_at"]
            archived_by = archived_bot["archived_by"]
            archive_reason = archived_bot["archive_reason"]
            
            # Convert archived bot to state format
            bot_state = {
                "bot_id": archived_bot["bot_id"],
                "custom_name": archived_bot.get("custom_name"),
                "status": archived_bot["final_status"],
                "instrument": archived_bot["instrument"],
                "account_name": archived_bot["account_name"],
                "accounts_ids": archived_bot.get("accounts_ids"),
                "start_time": archived_bot["start_time"],
                "last_health_check": archived_bot["last_health_check"],
                "stopped_at": archived_bot.get("stopped_at"),
                "total_pnl": archived_bot.get("final_pnl", 0.0),
                "open_positions": archived_bot.get("open_positions", 0),
                "closed_positions": archived_bot.get("closed_positions", 0),
                "active_orders": archived_bot.get("active_orders", 0),
                "won_orders": archived_bot.get("won_orders", 0),
                "lost_orders": archived_bot.get("lost_orders", 0),
                "config": archived_bot.get("config"),
                "data_source": "archived"
            }
        
        # Calculate additional metrics
        win_rate = None
        if bot_state.get("won_orders") and bot_state.get("lost_orders"):
            total_trades = bot_state["won_orders"] + bot_state["lost_orders"]
            if total_trades > 0:
                win_rate = round((bot_state["won_orders"] / total_trades) * 100, 2)
        
        # Calculate uptime
        start_time = datetime.fromisoformat(bot_state["start_time"].replace('Z', '+00:00')) if isinstance(bot_state["start_time"], str) else bot_state["start_time"]
        stopped_at = datetime.fromisoformat(bot_state["stopped_at"].replace('Z', '+00:00')) if bot_state.get("stopped_at") and isinstance(bot_state["stopped_at"], str) else bot_state.get("stopped_at")
        end_time = stopped_at if stopped_at else datetime.now(timezone.utc)
        uptime_seconds = int((end_time - start_time).total_seconds())
        
        # Convert to BotStateResponse
        bot_response = BotStateResponse(
            bot_id=bot_state["bot_id"],
            custom_name=bot_state.get("custom_name"),
            status=bot_state["status"],
            instrument=bot_state["instrument"],
            account_name=bot_state["account_name"],
            accounts_ids=bot_state.get("accounts_ids"),
            start_time=start_time,
            last_health_check=datetime.fromisoformat(bot_state["last_health_check"].replace('Z', '+00:00')) if isinstance(bot_state["last_health_check"], str) else bot_state["last_health_check"],
            stopped_at=stopped_at,
            total_pnl=float(bot_state.get("total_pnl", 0.0)),
            open_positions=bot_state.get("open_positions", 0),
            closed_positions=bot_state.get("closed_positions", 0),
            active_orders=bot_state.get("active_orders", 0),
            won_orders=bot_state.get("won_orders", 0),
            lost_orders=bot_state.get("lost_orders", 0),
            win_rate=win_rate,
            data_source=bot_state.get("data_source", "unknown")
        )
        
        # Build comprehensive response
        return BotDetailsResponse(
            success=True,
            bot=bot_response,
            uptime_seconds=uptime_seconds,
            is_archived=is_archived,
            archived_at=archived_at,
            archived_by=archived_by,
            archive_reason=archive_reason,
            fibonacci_levels=bot_state.get("config", {}).get("fibonacci_levels") if bot_state.get("config") else None,
            trading_window_active=bot_state.get("config", {}).get("trading_window_active", False) if bot_state.get("config") else False,
            threshold_reached=bot_state.get("config", {}).get("threshold_reached", False) if bot_state.get("config") else False,
            recent_trades=None,  # TODO: Implement trade history
            recent_logs=None,  # TODO: Implement execution logs
            health_status="archived" if is_archived else ("healthy" if bot_state["status"] == BotStatus.RUNNING else "stopped"),
            last_error=None,
            error_count=0,
            restart_count=0,
            version="1.0.0"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting bot details for {bot_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== CONFIGURATION LIBRARY ENDPOINTS =====

@bot_router.get("/configurations/list", response_model=BotConfigurationsListResponse)
async def get_bot_configurations(
    bot_type: Optional[str] = Query(None, description="Filter by bot type"),
    status: str = Query("active", description="Filter by status"),
    limit: int = Query(100, ge=1, le=500, description="Number of results"),
    current_user: UserResponse = Depends(get_current_confirmed_user)
) -> BotConfigurationsListResponse:
    """
    Retrieve saved bot configurations/templates.
    """
    try:
        configurations = BotSupabase.get_all_bot_configurations(
            bot_type=bot_type,
            created_by=current_user.email,  # Filter by current user
            status=status,
            limit=limit
        )
        
        # Convert to response models
        config_responses = []
        for config in configurations:
            config_response = BotConfigurationResponse(
                id=config["id"],
                config_id=config["config_id"],
                name=config["name"],
                description=config.get("description"),
                bot_type=config["bot_type"],
                config=config["config"],
                tags=config.get("tags", []),
                created_by=config["created_by"],
                is_template=config.get("is_template", False),
                is_shared=config.get("is_shared", False),
                is_favorite=config.get("is_favorite", False),
                status=config.get("status", "active"),
                times_used=config.get("times_used", 0),
                last_used=datetime.fromisoformat(config["last_used"].replace('Z', '+00:00')) if config.get("last_used") and isinstance(config["last_used"], str) else config.get("last_used"),
                success_rate=config.get("success_rate"),
                total_pnl=config.get("total_pnl"),
                performance_metrics=config.get("performance_metrics"),
                created_at=datetime.fromisoformat(config["created_at"].replace('Z', '+00:00')) if isinstance(config["created_at"], str) else config["created_at"],
                updated_at=datetime.fromisoformat(config["updated_at"].replace('Z', '+00:00')) if isinstance(config["updated_at"], str) else config["updated_at"]
            )
            config_responses.append(config_response)
        
        return BotConfigurationsListResponse(
            success=True,
            configurations=config_responses,
            total=len(config_responses),
            timestamp=datetime.now(timezone.utc)
        )
        
    except Exception as e:
        logger.error(f"Error getting bot configurations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@bot_router.post("/configurations/save", response_model=SaveConfigurationResponse)
async def save_bot_configuration(
    request: BotConfigurationRequest,
    current_user: UserResponse = Depends(get_current_confirmed_user)
) -> SaveConfigurationResponse:
    """
    Save a bot configuration as a template for later use.
    """
    try:
        # Generate config_id
        import uuid
        import time
        timestamp = int(time.time())
        unique_id = str(uuid.uuid4())[:8]
        config_id = f"config_{request.bot_type}_{timestamp}_{unique_id}"
        
        # Save configuration
        saved_config = BotSupabase.insert_bot_configuration(
            config_id=config_id,
            name=request.name,
            bot_type=request.bot_type,
            config=request.config,
            created_by=current_user.email,
            description=request.description,
            tags=request.tags,
            is_template=request.is_template,
            is_shared=request.is_shared
        )
        
        if not saved_config:
            raise HTTPException(status_code=500, detail="Failed to save configuration")
        
        return SaveConfigurationResponse(
            success=True,
            message="Configuration saved successfully",
            configuration_id=config_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving bot configuration: {e}")
        raise HTTPException(status_code=500, detail=str(e))
