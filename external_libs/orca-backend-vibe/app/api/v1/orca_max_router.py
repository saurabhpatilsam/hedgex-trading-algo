import datetime
import json
from typing import Optional, List, Union, Dict
from fastapi import APIRouter, HTTPException, Body, Query, Depends
from fastapi import UploadFile, File, Form
from starlette.responses import JSONResponse
from app.api.v1.endpoints.max_backtest import run_max_backtest_logic
from app.api.v1.endpoints.max_live import run_orca_system
from app.services.bot_control.bot_control_service_supabase import BotControlService
from app.services.orca_max.helpers.enums import ENVIRONMENT, TeamWay, PointType, Contract, PointPosition
from app.services.orca_max.schemas import AccountConfig
from app.services.orca_max_backtesting.helper import read_bytes_cleaned
from app.services.orca_supabase.orca_supabase import (
    get_all_run_configs,
    get_active_run_configs,
    update_run_config_status,
    find_duplicate_configs,
    has_active_duplicate
)
from app.services.orca_supabase.config_utils import normalize_strategy_config
from app.api.dependencies import get_current_confirmed_user
from app.services.auth.models import UserResponse
from app.utils.name_generator import get_custom_name
from app.services.redis.bot_state_manager import BotStateManager
# from app.services.bot_control.bot_control_service import BotControlService
# No longer need database sessions with Supabase
# from app.db.database import get_db, async_session_maker
from concurrent.futures import ThreadPoolExecutor

max_router = APIRouter(prefix="/run-bot")

# Simple cache to prevent excessive database queries from frontend polling
_configs_cache = {"data": None, "timestamp": None}
CACHE_TTL_SECONDS = 5

# Global thread pool executor for running bots in background
# Using max_workers=10 to allow up to 10 concurrent bots
bot_executor = ThreadPoolExecutor(max_workers=10, thread_name_prefix="BotWorker")


def run_orca_system_background_sync(run_config: Dict, run_id: int, bot_id: str):
    """
    Synchronous wrapper to run the bot in a separate thread.
    This allows the FastAPI response to return immediately.
    """
    import asyncio
    from app.utils.logging_setup import logger
    
    try:
        # Create new event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Run the async bot execution
        loop.run_until_complete(_run_bot_async(run_config, run_id, bot_id))
        
    except Exception as e:
        logger.error(f"❌ Error in background thread for run_id {run_id}: {str(e)}")
    finally:
        loop.close()


async def _run_bot_async(run_config: Dict, run_id: int, bot_id: str):
    """
    Async function that actually runs the bot.
    This runs in a separate thread to not block the API response.
    """
    from app.utils.logging_setup import logger
    from app.services.orca_supabase.orca_supabase import update_run_config_status
    from app.api.v1.endpoints.max_live_controlled import run_orca_system_controlled
    
    try:
        logger.info(f"🚀 Starting background execution for run_id: {run_id}, bot_id: {bot_id}")
        
        # Update status to running
        update_run_config_status(run_id, "running")
        
        # Update bot state in Supabase
        state_manager = BotStateManager(bot_id)
        await state_manager.update_status("running")
        
        # Run the CONTROLLED system with bot_id for pause/resume/stop
        try:
            result = await run_orca_system_controlled(
                run_config,
                bot_id  # Pass bot_id for control
            )
        except Exception as e:
            logger.error(f"Error running bot {bot_id}: {e}")
            raise
        
        # Mark as completed
        update_run_config_status(run_id, "completed")
        await state_manager.update_status("stopped")
        logger.info(f"✅ Run {run_id} completed successfully")
        
    except Exception as e:
        logger.error(f"❌ Error in background task for run_id {run_id}: {str(e)}")
        update_run_config_status(run_id, "failed")
        # Update bot state to error
        try:
            state_manager = BotStateManager(bot_id)
            await state_manager.update_status("error")
            await state_manager.record_action("error", {"error": str(e)}, "system")
        except:
            pass
        logger.error(f"Run {run_id} failed with error: {str(e)}")


@max_router.post("/max-backtest")
async def run_bot_backtesting(
    accountName: str = Form(...),
    mode: str = Form(...),
    contract: str = Form(...),
    point_key: str = Form(...),
    exit_strategy_key: str = Form(...),
    customName: Optional[str] = Form(None, description="Optional custom name for this run"),
    notes: Optional[str] = Form(None),
    dateFrom: Optional[str] = Form(None),
    dateTo: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    current_user: UserResponse = Depends(get_current_confirmed_user),
):
    try:
        payload = await run_max_backtest_logic(
            account_name=accountName,
            mode=mode,
            contract=contract,
            point_key=point_key,
            exit_strategy_key=exit_strategy_key,
            custom_name=customName,
            notes=notes,
            date_from=dateFrom,
            date_to=dateTo,
            file=file,
        )
        return JSONResponse(content=payload, status_code=200)

    except HTTPException:
        # Re-raise FastAPI-native errors as-is
        raise
    except Exception as e:
        # Fall-through for anything unexpected
        raise HTTPException(status_code=500, detail=str(e))

@max_router.post("/max")
async def run_bot_max(
    accountName: str = Form("APEX_136189"),
    contract: Union[Contract] = Form(),
    trading_mode: Union[TeamWay] = Form(),
    trading_side: Union[PointType] = Form(),
    point_strategy_key: str = Form("15_7_5_2"),
    point_position: Union[PointPosition] = Form(),
    exit_strategy_key: str = Form("15_15"),
    customName: Optional[str] = Form(None, description="Optional custom name for this run"),
    dateFrom: Optional[datetime.datetime] = Form(),
    dateTo: Optional[datetime.datetime] = Form(),
    # file: Optional[UploadFile] = File(None),
    # parse these from form too for consistency
    quantity: int = Form(1),
    environment: Optional[ENVIRONMENT] = Form(),
    # accept JSON string; client sends accounts_ids='[{"id": "...", ...}]'
    # [{"tv_id"="D18156705", "ta_id"="PAAPEX1361890000008"}]
    accounts_ids: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    user: Optional[str] = Form("system", description="User who is running the bot"),
    current_user: UserResponse = Depends(get_current_confirmed_user),
):

    try:
        file = None
        # 1) File path: parse and run
        if file:
            contents = await file.read()
            if contents is None or len(contents) == 0:
                raise HTTPException(status_code=400, detail="Uploaded file is empty.")

            # Parse uploaded dataset
            data, all_data = read_bytes_cleaned(contents, rows=-1)

        parsed_accounts: Optional[List[AccountConfig]] = None
        try:
            if accounts_ids and accounts_ids != [""] and accounts_ids!='string':
                parsed = json.loads(accounts_ids)
                # Pydantic-validate each entry
                parsed_accounts = [AccountConfig(**item) for item in parsed]
        except Exception as e:
            raise ValueError('Could not parse Accounts ids "{}"'.format(accounts_ids))

        # Generate or use custom name
        run_name = get_custom_name(customName)
        print(f'run_name: {run_name}')
        
        run_config = {
            "main_account": accountName,
            "instrument_name": contract.value,
            "way": TeamWay(trading_mode),
            "point_type": PointType(trading_side),
            "point_strategy_key": point_strategy_key,
            "point_position": point_position,
            "exit_strategy_key": exit_strategy_key,
            "quantity": quantity,
            "environment": (
                environment.value
                if isinstance(environment, ENVIRONMENT)
                else environment
            ),
            "price_file": file,  # whatever your system expects here
            "start_time": dateFrom,
            "end_time": dateTo,
            "accounts_ids": parsed_accounts,
            "custom_name": run_name,  # Store the custom or generated name
            "notes": notes,
            "user": current_user.email,  # Use authenticated user's email for tracking
        }

        # Store config in database with "queued" status
        from app.services.orca_supabase.orca_supabase import insert_run_config
        from app.services.orca_supabase.config_utils import extract_strategy_config
        from app.utils.logging_setup import logger
        
        # Extract strategy config for duplicate detection
        strategy_config = extract_strategy_config(run_config)
        
        # Check for active duplicates
        has_duplicate, duplicate_records = has_active_duplicate(strategy_config)
        
        # Create serializable copy of config
        config_to_store = {
            k: v if not hasattr(v, '__dict__') else str(v)
            for k, v in run_config.items()
        }
        
        # Handle datetime serialization
        if config_to_store.get("start_time"):
            config_to_store["start_time"] = str(config_to_store["start_time"])
        if config_to_store.get("end_time"):
            config_to_store["end_time"] = str(config_to_store["end_time"])
        
        # Insert with "queued" status
        record = insert_run_config(
            config_to_store,
            strategy_config=strategy_config,
            created_by=current_user.email,
            status="queued"
        )
        
        run_id = record.get("id") if record else None
        
        if not run_id:
            raise HTTPException(status_code=500, detail="Failed to create run configuration")
        
        logger.info(f"📋 Run config queued with ID: {run_id} for {run_name}")
        
        if has_duplicate:
            duplicate_ids = [rec.get("id") for rec in duplicate_records]
            logger.warning(f"⚠️  Duplicate configuration detected. Active runs: {duplicate_ids}")
        
        # Generate bot_id for tracking
        import uuid
        bot_id = f"orca_max_{run_id}_{uuid.uuid4().hex[:8]}"
        
        # Create bot in tracking system using Supabase
        try:
            # FIRST: Create bot in bots table (required for foreign key)
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
                logger.error(f"Failed to create bot {bot_id}")
                # Continue anyway, the bot might still run
            
            # SECOND: Initialize bot state (after bot exists in bots table)
            # Note: This is already done inside create_bot, but keeping for compatibility
            # state_manager = BotStateManager(bot_id)
            # await state_manager.initialize_state(
            #     instrument=contract.value,
            #     account_name=accountName,
            #     accounts_ids=json.dumps(parsed_accounts) if parsed_accounts else "",
            #     custom_name=run_name
            # )
        except Exception as e:
            logger.warning(f"Failed to initialize bot tracking: {e}")
        
        # Submit bot to background thread pool for execution
        # This returns immediately without blocking the API response
        bot_executor.submit(run_orca_system_background_sync, run_config, run_id, bot_id)
        logger.info(f"✅ Bot {bot_id} ({run_name}) submitted to background executor")
        
        # Return immediately with run_id and name
        return JSONResponse(content={
            "status": "queued",
            "message": "Trading bot queued for execution",
            "run_id": run_id,
            "bot_id": bot_id,  # Include the bot_id for tracking
            "run_name": run_name,  # Include the custom/generated name
            "is_duplicate": has_duplicate,
            "duplicate_run_ids": [rec.get("id") for rec in duplicate_records] if has_duplicate else [],
            "note": "Use GET /api/v1/run-bot/configs/{run_id} to check status or GET /api/bots/{bot_id} for bot details"
        }, status_code=202)  # 202 Accepted
    except HTTPException:
        raise
    except Exception as e:
        raise e
        raise HTTPException(status_code=500, detail="Internal server error")


@max_router.get("/configs/{run_id}")
async def get_run_config_by_id(
    run_id: int,
    current_user: UserResponse = Depends(get_current_confirmed_user)
):
    """
    Get a specific run configuration by ID.
    Use this to check the status of a queued/running job.
    
    Args:
        run_id: The ID of the run configuration
    
    Returns:
        Run configuration record with current status
    """
    try:
        all_configs = get_all_run_configs()
        config = next((c for c in all_configs if c.get("id") == run_id), None)
        
        if not config:
            raise HTTPException(status_code=404, detail=f"Run config with ID {run_id} not found")
        
        return JSONResponse(content={"config": config}, status_code=200)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching config: {str(e)}")


@max_router.get("/configs")
async def get_run_configs(
    status: Optional[str] = Query(None, description="Filter by status (e.g., 'queued', 'running', 'completed', 'failed')"),
    current_user: UserResponse = Depends(get_current_confirmed_user)
):
    """
    Get all run configurations, optionally filtered by status.
    Cached for 5 seconds to handle aggressive frontend polling.
    
    Args:
        status: Optional status filter ('queued', 'running', 'completed', 'failed', etc.)
    
    Returns:
        List of run configuration records
    """
    try:
        # Check cache if no status filter (most common case)
        if status is None:
            now = datetime.datetime.now()
            if (_configs_cache["data"] is not None and 
                _configs_cache["timestamp"] is not None and
                (now - _configs_cache["timestamp"]).total_seconds() < CACHE_TTL_SECONDS):
                # Return cached data
                return JSONResponse(
                    content=_configs_cache["data"], 
                    status_code=200,
                    headers={"X-Cache": "HIT"}
                )
        
        # Fetch fresh data
        configs = get_all_run_configs(status_filter=status)
        response_data = {"configs": configs, "count": len(configs)}
        
        # Update cache if no filter
        if status is None:
            _configs_cache["data"] = response_data
            _configs_cache["timestamp"] = datetime.datetime.now()
        
        return JSONResponse(
            content=response_data, 
            status_code=200,
            headers={"X-Cache": "MISS"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching configs: {str(e)}")


@max_router.get("/configs/active")
async def get_active_configs(
    current_user: UserResponse = Depends(get_current_confirmed_user)
):
    """
    Get all active (running) run configurations.
    
    Returns:
        List of active run configuration records
    """
    try:
        configs = get_active_run_configs()
        return JSONResponse(content={"configs": configs, "count": len(configs)}, status_code=200)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching active configs: {str(e)}")


@max_router.patch("/configs/{run_id}/status")
async def update_config_status(
    run_id: int,
    status: str = Body(..., embed=True, description="New status (e.g., 'stopped', 'completed', 'failed')"),
    current_user: UserResponse = Depends(get_current_confirmed_user)
):
    """
    Update the status of a run configuration.
    
    Args:
        run_id: The ID of the run configuration
        status: New status to set
    
    Returns:
        Updated run configuration record
    """
    try:
        updated_record = update_run_config_status(run_id, status)
        if not updated_record:
            raise HTTPException(status_code=404, detail=f"Run config with ID {run_id} not found")
        
        return JSONResponse(content={"config": updated_record}, status_code=200)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating config status: {str(e)}")


@max_router.post("/configs/check-duplicate")
async def check_duplicate_config(
    strategy_config: Dict = Body(...),
    current_user: UserResponse = Depends(get_current_confirmed_user)
):
    """
    Check if a strategy configuration has duplicates.
    
    Provide the identifying fields:
    - instrument_name
    - way
    - point_type
    - point_strategy_key
    - point_position
    - exit_strategy_key
    
    Args:
        strategy_config: Dictionary with the identifying fields
    
    Returns:
        Information about duplicate configurations
    """
    try:
        # Normalize the strategy config for comparison
        normalized_config = normalize_strategy_config(strategy_config)
        
        # Check for active duplicates
        has_duplicate, duplicate_records = has_active_duplicate(normalized_config)
        
        # Also get all duplicates (including completed/failed)
        all_duplicates = find_duplicate_configs(normalized_config)
        
        return JSONResponse(content={
            "has_active_duplicate": has_duplicate,
            "active_duplicates": duplicate_records,
            "active_count": len(duplicate_records),
            "all_duplicates": all_duplicates,
            "total_count": len(all_duplicates),
            "strategy_config": normalized_config
        }, status_code=200)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking for duplicates: {str(e)}")


@max_router.get("/configs/{run_id}/duplicates")
async def get_config_duplicates(
    run_id: int,
    current_user: UserResponse = Depends(get_current_confirmed_user)
):
    """
    Find all configurations that are duplicates of a specific run.
    
    Args:
        run_id: The ID of the run configuration to check
    
    Returns:
        List of duplicate configurations
    """
    try:
        # First, get the target config
        all_configs = get_all_run_configs()
        target_config = next((c for c in all_configs if c.get("id") == run_id), None)
        
        if not target_config:
            raise HTTPException(status_code=404, detail=f"Run config with ID {run_id} not found")
        
        strategy_config = target_config.get("strategy_config", {})
        
        # Find all duplicates (excluding the target itself)
        duplicates = find_duplicate_configs(strategy_config)
        duplicates = [d for d in duplicates if d.get("id") != run_id]
        
        return JSONResponse(content={
            "run_id": run_id,
            "strategy_config": strategy_config,
            "duplicates": duplicates,
            "count": len(duplicates)
        }, status_code=200)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error finding duplicates: {str(e)}")
