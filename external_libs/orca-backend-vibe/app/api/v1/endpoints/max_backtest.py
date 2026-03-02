# app/endpoints/max_backtest.py
from typing import Optional, Tuple, Dict, Any
from fastapi import HTTPException, UploadFile
import asyncio
from concurrent.futures import ThreadPoolExecutor

from app.services.orca_max_backtesting.helper import read_bytes_cleaned
from app.services.orca_max_backtesting.orca_enums import TeamWay
from app.services.orca_max_backtesting.run import run_single


async def run_max_backtest_logic(
    *,
    account_name: str,
    mode: str,
    contract: str,
    point_key: str,
    exit_strategy_key: str,
    custom_name: Optional[str] = None,
    notes: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    file: Optional[UploadFile] = None,
) -> Dict[str, Any]:
    """
    Core logic for the /run-bot/max-backtest endpoint.

    Rules:
    - If a file is provided, use it and ignore date range.
    - Else, require date_from and date_to.
    - 'mode' is always backtesting (per router comment), but still passed through.
    """
    # Import name generator
    from app.utils.name_generator import get_custom_name
    
    # Generate or use custom name
    run_name = get_custom_name(custom_name)
    
    # Set a default TeamWay for backtesting
    max_mode = TeamWay.LONG  # Default mode for backtesting

    # 1) File path: parse and run
    if file:
        contents = await file.read()
        if contents is None or len(contents) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        # Parse uploaded dataset
        data, all_data = read_bytes_cleaned(contents, rows=-1)

        # Run your engine in thread pool (CPU-intensive operation)
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor() as pool:
            result, order_points_completed_dict = await loop.run_in_executor(
                pool,
                run_single,
                contract,
                data,
                f"{file.filename}-v2",  # data_name
                max_mode,  # way
                exit_strategy_key,
                point_key,
            )

        return {
            "result": result,
            "trades": order_points_completed_dict,
            "run_name": run_name,
            "meta": {
                "source": "file",
                "filename": file.filename,
                "accountName": account_name,
                "mode": mode,
                "customName": run_name,
                "notes": notes,
            },
        }

    # 2) Date-range path: both dates must be present
    if not date_from or not date_to:
        raise HTTPException(
            status_code=400,
            detail="Either upload a file OR provide both dateFrom and dateTo.",
        )

    # Load time-bounded data (implement this inside core.data_io)
    try:
        data, data_name = _load_data_for_range(contract, date_from, date_to)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch data: {e}")

    # Run your engine in thread pool (CPU-intensive operation)
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as pool:
        result, order_points_completed_dict = await loop.run_in_executor(
            pool,
            run_single,
            contract,
            data,
            data_name,
            max_mode,  # way
            exit_strategy_key,
            point_key,
        )

    return {
        "result": result,
        "trades": order_points_completed_dict,
        "run_name": run_name,
        "meta": {
            "source": "date_range",
            "dateFrom": date_from,
            "dateTo": date_to,
            "accountName": account_name,
            "mode": mode,
            "customName": run_name,
            "notes": notes,
        },
    }


def _load_data_for_range(
    contract: str, date_from: str, date_to: str
) -> Tuple[Any, str]:
    """
    Fetches/constructs the dataset for a date range.
    Returns (data, data_name).
    """
    # You can do validation/conversion here if your fetch expects datetimes.
    data = fetch_data_between_dates(contract=contract, start=date_from, end=date_to)
    if data is None:
        raise ValueError("No data returned for the provided date range.")

    data_name = f"{contract}-{date_from}_to_{date_to}"
    return data, data_name
