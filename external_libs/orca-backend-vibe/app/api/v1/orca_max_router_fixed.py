"""
FIXED version of orca_max_router that properly integrates with BotThreadManager.
This provides REAL bot control, not just database updates.
"""
import datetime
import json
from typing import Optional, Dict
from fastapi import APIRouter, HTTPException, Form, Depends
from starlette.responses import JSONResponse

from app.services.bot_control.bot_thread_manager import bot_thread_manager, BotThreadStatus
from app.services.bot_control.bot_control_service_supabase import BotControlService
from app.services.orca_max.helpers.enums import ENVIRONMENT, TeamWay, PointType, Contract, PointPosition
from app.services.orca_supabase.orca_supabase import (
    update_run_config_status,
    find_duplicate_configs,
    has_active_duplicate
)
from app.services.orca_supabase.config_utils import normalize_strategy_config
from app.api.dependencies import get_current_confirmed_user
from app.services.auth.models import UserResponse
from app.utils.name_generator import get_custom_name
from app.services.redis.bot_state_manager import BotStateManager
from app.utils.logging_setup import logger

max_router_fixed = APIRouter(prefix="/run-bot-fixed")


def run_bot_wrapper(run_config: Dict, run_id: int, bot_id: str, pause_event=None, stop_event=None):
    """
    Wrapper function that runs in the thread with control events.
    """
    import asyncio
    from app.services.orca_max.orca_max_controlled_fixed import run_orca_system_controlled_fixed
    
    try:
        # Create new event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Update status to running
        update_run_config_status(run_id, "running")
        
        # Run the bot with control events
        result = loop.run_until_complete(
            run_orca_system_controlled_fixed(
                run_config,
                bot_id,
                pause_event=pause_event,
                stop_event=stop_event
            )
        )
        
        # Mark as completed
        update_run_config_status(run_id, "completed")
        
        logger.info(f"✅ Bot {bot_id} (run_id: {run_id}) completed successfully")
        return result
        
    except Exception as e:
        logger.error(f"❌ Bot {bot_id} error: {e}")
        update_run_config_status(run_id, "failed")
        raise
    finally:
        loop.close()


@max_router_fixed.post("/max")
async def run_bot_max_fixed(
    accountName: str = Form("APEX_136189"),
    contract: Contract = Form(),
    trading_mode: TeamWay = Form(),
    trading_side: PointType = Form(),
    point_strategy_key: str = Form("15_7_5_2"),
    point_position: PointPosition = Form(),
    exit_strategy_key: str = Form("15_15"),
    customName: Optional[str] = Form(None),
    dateFrom: Optional[datetime.datetime] = Form(None),
    dateTo: Optional[datetime.datetime] = Form(None),
    quantity: int = Form(1),
    environment: Optional[ENVIRONMENT] = Form(None),
    accounts_ids: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    current_user: UserResponse = Depends(get_current_confirmed_user),
):
    """
    Start a new trading bot with REAL control capabilities.
    """
    try:
        # Parse accounts
        parsed_accounts = json.loads(accounts_ids) if accounts_ids else []
        if not parsed_accounts:
            logger.warning("No accounts_ids provided")
        
        # Generate custom name
        run_name = customName or get_custom_name()
        
        # Create run config
        run_config = {
            "instrument_name": contract.value,
            "point_type": trading_side.value,
            "way": trading_mode.value,
            "exit_strategy_key": exit_strategy_key,
            "point_strategy_key": point_strategy_key,
            "point_position": point_position,
            "main_account": accountName,
            "accounts_ids": parsed_accounts,
            "start_time": dateFrom or datetime.datetime.now(),
            "end_time": dateTo,
            "environment": environment.value if environment else ENVIRONMENT.PROD.value,
            "quantity": quantity,
            "notes": notes,
            "created_by": current_user.email,
            "name": run_name
        }
        
        # Normalize config
        config_to_store = normalize_strategy_config(run_config)
        
        # Check for duplicates
        has_duplicate, duplicate_records = has_active_duplicate(config_to_store)
        
        # Store in database
        from app.services.orca_supabase.orca_supabase import insert_run_config
        run_id = insert_run_config(run_config, config_to_store)
        
        # Generate bot ID
        import uuid
        bot_id = f"orca_max_{run_id}_{uuid.uuid4().hex[:8]}"
        
        # Create bot in database
        bot_service = BotControlService()
        bot_created = await bot_service.create_bot(
            bot_id=bot_id,
            instrument=contract.value,
            account_name=accountName,
            accounts_ids=json.dumps(parsed_accounts) if parsed_accounts else None,
            custom_name=run_name,
            config=config_to_store,
            created_by=current_user.email
        )
        
        if not bot_created:
            logger.error(f"Failed to create bot {bot_id} in database")
            # Continue anyway
        
        # Start bot with REAL thread control
        success = bot_thread_manager.start_bot(
            bot_id=bot_id,
            run_function=run_bot_wrapper,
            run_config=run_config,
            run_id=run_id,
            bot_id=bot_id
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to start bot thread")
        
        logger.info(f"✅ Bot {bot_id} ({run_name}) started with REAL control")
        
        # Return immediately
        return JSONResponse(content={
            "status": "queued",
            "message": "Trading bot started with control capabilities",
            "run_id": run_id,
            "bot_id": bot_id,
            "run_name": run_name,
            "is_duplicate": has_duplicate,
            "duplicate_run_ids": [rec.get("id") for rec in duplicate_records] if has_duplicate else [],
            "note": "Bot can now be properly paused, resumed, and stopped"
        }, status_code=202)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting bot: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@max_router_fixed.post("/bots/{bot_id}/pause")
async def pause_bot_fixed(
    bot_id: str,
    current_user: UserResponse = Depends(get_current_confirmed_user)
):
    """REAL pause that actually pauses the thread."""
    try:
        # Pause the actual thread
        thread_paused = bot_thread_manager.pause_bot(bot_id)
        
        if not thread_paused:
            # Check thread status
            status = bot_thread_manager.get_bot_status(bot_id)
            if status is None:
                raise HTTPException(status_code=404, detail=f"Bot {bot_id} not found in thread registry")
            else:
                raise HTTPException(status_code=400, detail=f"Cannot pause bot in status: {status.value}")
        
        # Update database
        bot_service = BotControlService()
        await bot_service.pause_bot(
            bot_id=bot_id,
            performed_by=current_user.email,
            reason="Paused via API"
        )
        
        return JSONResponse({
            "success": True,
            "message": f"Bot {bot_id} ACTUALLY paused (thread is blocked)",
            "thread_status": BotThreadStatus.PAUSED.value
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error pausing bot {bot_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@max_router_fixed.post("/bots/{bot_id}/resume")
async def resume_bot_fixed(
    bot_id: str,
    current_user: UserResponse = Depends(get_current_confirmed_user)
):
    """REAL resume that actually resumes the thread."""
    try:
        # Resume the actual thread
        thread_resumed = bot_thread_manager.resume_bot(bot_id)
        
        if not thread_resumed:
            # Check thread status
            status = bot_thread_manager.get_bot_status(bot_id)
            if status is None:
                raise HTTPException(status_code=404, detail=f"Bot {bot_id} not found in thread registry")
            else:
                raise HTTPException(status_code=400, detail=f"Cannot resume bot in status: {status.value}")
        
        # Update database
        bot_service = BotControlService()
        await bot_service.resume_bot(
            bot_id=bot_id,
            performed_by=current_user.email
        )
        
        return JSONResponse({
            "success": True,
            "message": f"Bot {bot_id} ACTUALLY resumed (thread is running)",
            "thread_status": BotThreadStatus.RUNNING.value
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resuming bot {bot_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@max_router_fixed.post("/bots/{bot_id}/stop")
async def stop_bot_fixed(
    bot_id: str,
    force: bool = False,
    current_user: UserResponse = Depends(get_current_confirmed_user)
):
    """REAL stop that actually stops the thread."""
    try:
        # Stop the actual thread
        if force:
            thread_stopped = bot_thread_manager.force_kill_bot(bot_id)
            message = f"Bot {bot_id} FORCE KILLED"
        else:
            thread_stopped = bot_thread_manager.stop_bot(bot_id, timeout=10.0)
            message = f"Bot {bot_id} ACTUALLY stopped (thread terminated)"
        
        if not thread_stopped:
            # Try force kill
            logger.warning(f"Graceful stop failed for {bot_id}, attempting force kill...")
            bot_thread_manager.force_kill_bot(bot_id)
            message = f"Bot {bot_id} FORCE KILLED after graceful stop failed"
        
        # Update database
        bot_service = BotControlService()
        await bot_service.stop_bot(
            bot_id=bot_id,
            performed_by=current_user.email,
            reason="Stopped via API"
        )
        
        return JSONResponse({
            "success": True,
            "message": message,
            "thread_status": BotThreadStatus.STOPPED.value
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping bot {bot_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@max_router_fixed.get("/thread-status")
async def get_thread_status(
    current_user: UserResponse = Depends(get_current_confirmed_user)
):
    """Get REAL thread status of all bots."""
    try:
        all_bots = bot_thread_manager.get_all_bots()
        
        # Clean up dead bots
        cleaned = bot_thread_manager.cleanup_dead_bots()
        
        return JSONResponse({
            "active_threads": len(all_bots),
            "cleaned_up": cleaned,
            "bots": all_bots
        })
        
    except Exception as e:
        logger.error(f"Error getting thread status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@max_router_fixed.post("/emergency-stop-all")
async def emergency_stop_all(
    current_user: UserResponse = Depends(get_current_confirmed_user)
):
    """EMERGENCY: Stop ALL bots immediately."""
    try:
        if current_user.email != "admin@example.com":  # Add proper admin check
            raise HTTPException(status_code=403, detail="Admin access required")
        
        bot_thread_manager.emergency_stop_all(timeout=5.0)
        
        return JSONResponse({
            "success": True,
            "message": "🚨 ALL BOTS STOPPED - Emergency shutdown complete"
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in emergency stop: {e}")
        raise HTTPException(status_code=500, detail=str(e))
