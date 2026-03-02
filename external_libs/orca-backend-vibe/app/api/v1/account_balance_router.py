"""
Account Balance API Router

This router provides endpoints for fetching Tradovate account balance information.
It integrates with the balance_tradovate service to retrieve real-time account data.
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field

from app.services.tradingview.balance_tradovate import (
    get_all_account_balances,
    get_account_balance,
)
from app.utils.logging_setup import logger


# Pydantic models for request/response
class BalanceInfo(BaseModel):
    """Balance information from Tradovate"""
    totalCashValue: float = Field(description="Total cash value in the account")
    realizedPnL: float = Field(description="Realized profit/loss")
    weekRealizedPnL: float = Field(description="Week-to-date realized profit/loss")


class AccountBalanceResponse(BaseModel):
    """Response model for a single account balance"""
    parent_account: Optional[str] = Field(description="Parent account identifier")
    orca_name: Optional[str] = Field(description="Orca account name")
    tradovate_id: Optional[Any] = Field(description="Tradovate account ID")
    tradingView_id: Optional[Any] = Field(default=None, description="TradingView account ID")
    balance: Optional[BalanceInfo] = Field(description="Account balance details")
    error: Optional[str] = Field(description="Error message if balance fetch failed")


class AllAccountsBalanceResponse(BaseModel):
    """Response model for all accounts balances"""
    username: str = Field(description="Parent username")
    total_accounts: int = Field(description="Total number of accounts")
    total_cash_value: float = Field(description="Sum of all accounts' cash values")
    total_realized_pnl: float = Field(description="Sum of all accounts' realized P&L")
    total_week_realized_pnl: float = Field(description="Sum of all accounts' week P&L")
    accounts: List[AccountBalanceResponse] = Field(description="List of account balances")


class MultiUserBalanceRequest(BaseModel):
    """Request model for fetching balances for multiple usernames"""
    usernames: List[str] = Field(description="List of usernames to fetch balances for")


class MultiUserBalanceResponse(BaseModel):
    """Response model for multiple users' balances"""
    users: List[AllAccountsBalanceResponse] = Field(description="List of users with their account balances")
    total_users: int = Field(description="Total number of users processed")
    errors: List[Dict[str, str]] = Field(default=[], description="List of errors by username")


# Create router
balance_router = APIRouter(
    prefix="/api/accounts",
    tags=["Account Balances"],
    responses={
        404: {"description": "Account not found"},
        500: {"description": "Internal server error"},
    }
)


@balance_router.get(
    "/balance/{username}",
    response_model=AllAccountsBalanceResponse,
    summary="Get all account balances for a username",
    description="Fetches balance information for all trading accounts under a parent username"
)
async def get_all_balances(
    username: str,
) -> AllAccountsBalanceResponse:
    """
    Get balance information for all accounts under a parent username.
    
    Args:
        username: Parent username (e.g., "APEX_136189")
    
    Returns:
        AllAccountsBalanceResponse with aggregated and individual account balances
    """
    try:
        logger.info(f"Fetching all account balances for username: {username}")
        
        # Get raw balance data
        result = get_all_account_balances(username)
        
        # Calculate aggregated totals
        total_cash = 0.0
        total_pnl = 0.0
        total_week_pnl = 0.0
        
        # Process accounts and calculate totals
        processed_accounts = []
        for account_data in result.get("accounts", []):
            # Convert to response model
            account_response = AccountBalanceResponse(
                parent_account=account_data.get("parent_account"),
                orca_name=account_data.get("orca_name"),
                tradovate_id=account_data.get("tradovate_id"),
                balance=BalanceInfo(**account_data["balance"]) if account_data.get("balance") else None,
                error=account_data.get("error")
            )
            processed_accounts.append(account_response)
            
            # Add to totals if balance exists
            if account_data.get("balance"):
                total_cash += account_data["balance"].get("totalCashValue", 0)
                total_pnl += account_data["balance"].get("realizedPnL", 0)
                total_week_pnl += account_data["balance"].get("weekRealizedPnL", 0)
        
        return AllAccountsBalanceResponse(
            username=username,
            total_accounts=len(processed_accounts),
            total_cash_value=total_cash,
            total_realized_pnl=total_pnl,
            total_week_realized_pnl=total_week_pnl,
            accounts=processed_accounts
        )
        
    except Exception as e:
        logger.error(f"Error fetching balances for username {username}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@balance_router.get(
    "/balance/{username}/{orca_name}",
    response_model=AccountBalanceResponse,
    summary="Get balance for a specific account",
    description="Fetches balance information for a specific trading account"
)
async def get_single_balance(
    username: str,
    orca_name: str,
) -> AccountBalanceResponse:
    """
    Get balance information for a specific account.
    
    Args:
        username: Parent username (e.g., "APEX_136189")
        orca_name: Specific account name (e.g., "PAAPEX1361890000010")
    
    Returns:
        AccountBalanceResponse with the account's balance information
    """
    try:
        logger.info(f"Fetching balance for account {orca_name} under username {username}")
        
        # Get balance for specific account
        result = get_account_balance(username, orca_name)
        
        # Convert to response model
        return AccountBalanceResponse(
            parent_account=result.get("parent_account"),
            orca_name=result.get("orca_name"),
            tradovate_id=result.get("tradovate_id"),
            tradingView_id=result.get("tradingView_id"),
            balance=BalanceInfo(**result["balance"]) if result.get("balance") else None,
            error=result.get("error")
        )
        
    except ValueError as e:
        logger.error(f"Account not found: {str(e)}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching balance for {orca_name}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@balance_router.post(
    "/balance/multiple",
    response_model=MultiUserBalanceResponse,
    summary="Get balances for multiple usernames",
    description="Fetches balance information for multiple parent usernames in a single request"
)
async def get_multiple_user_balances(
    request: MultiUserBalanceRequest,
) -> MultiUserBalanceResponse:
    """
    Get balance information for multiple usernames.
    
    This endpoint is useful for dashboards that need to display
    balances for multiple trading accounts/users at once.
    
    Args:
        request: MultiUserBalanceRequest containing list of usernames
    
    Returns:
        MultiUserBalanceResponse with all users' balance information
    """
    users_data = []
    errors = []
    
    for username in request.usernames:
        try:
            logger.info(f"Fetching balances for username: {username}")
            
            # Get raw balance data
            result = get_all_account_balances(username)
            
            # Calculate aggregated totals
            total_cash = 0.0
            total_pnl = 0.0
            total_week_pnl = 0.0
            
            # Process accounts
            processed_accounts = []
            for account_data in result.get("accounts", []):
                account_response = AccountBalanceResponse(
                    parent_account=account_data.get("parent_account"),
                    orca_name=account_data.get("orca_name"),
                    tradovate_id=account_data.get("tradovate_id"),
                    balance=BalanceInfo(**account_data["balance"]) if account_data.get("balance") else None,
                    error=account_data.get("error")
                )
                processed_accounts.append(account_response)
                
                # Add to totals
                if account_data.get("balance"):
                    total_cash += account_data["balance"].get("totalCashValue", 0)
                    total_pnl += account_data["balance"].get("realizedPnL", 0)
                    total_week_pnl += account_data["balance"].get("weekRealizedPnL", 0)
            
            users_data.append(AllAccountsBalanceResponse(
                username=username,
                total_accounts=len(processed_accounts),
                total_cash_value=total_cash,
                total_realized_pnl=total_pnl,
                total_week_realized_pnl=total_week_pnl,
                accounts=processed_accounts
            ))
            
        except Exception as e:
            logger.error(f"Error fetching balances for {username}: {str(e)}")
            errors.append({"username": username, "error": str(e)})
    
    return MultiUserBalanceResponse(
        users=users_data,
        total_users=len(users_data),
        errors=errors
    )


@balance_router.get(
    "/balance/summary/{username}",
    summary="Get account balance summary",
    description="Get a simplified summary of all accounts for a username"
)
async def get_balance_summary(
    username: str,
    include_zero_balance: bool = Query(default=True, description="Include accounts with zero balance")
) -> Dict[str, Any]:
    """
    Get a simplified summary of account balances.
    
    Args:
        username: Parent username
        include_zero_balance: Whether to include accounts with zero balance
    
    Returns:
        Summary with key metrics and account list
    """
    try:
        result = get_all_account_balances(username)
        
        # Filter and summarize
        summary = {
            "username": username,
            "timestamp": None,  # You could add timestamp if needed
            "summary": {
                "total_accounts": 0,
                "active_accounts": 0,
                "total_cash_value": 0.0,
                "total_realized_pnl": 0.0,
                "total_week_realized_pnl": 0.0,
                "accounts_with_errors": 0
            },
            "accounts": []
        }
        
        for account in result.get("accounts", []):
            has_balance = account.get("balance") is not None
            has_error = account.get("error") is not None
            
            if has_balance:
                balance_value = account["balance"].get("totalCashValue", 0)
                
                # Skip zero balance accounts if requested
                if not include_zero_balance and balance_value == 0:
                    continue
                
                summary["summary"]["total_cash_value"] += balance_value
                summary["summary"]["total_realized_pnl"] += account["balance"].get("realizedPnL", 0)
                summary["summary"]["total_week_realized_pnl"] += account["balance"].get("weekRealizedPnL", 0)
                
                if balance_value > 0:
                    summary["summary"]["active_accounts"] += 1
            
            if has_error:
                summary["summary"]["accounts_with_errors"] += 1
            
            # Add account to list
            account_info = {
                "orca_name": account.get("orca_name"),
                "tradovate_id": account.get("tradovate_id"),
                "cash_value": account["balance"].get("totalCashValue", 0) if has_balance else None,
                "realized_pnl": account["balance"].get("realizedPnL", 0) if has_balance else None,
                "status": "error" if has_error else ("active" if has_balance and account["balance"].get("totalCashValue", 0) > 0 else "inactive")
            }
            summary["accounts"].append(account_info)
        
        summary["summary"]["total_accounts"] = len(summary["accounts"])
        
        return summary
        
    except Exception as e:
        logger.error(f"Error creating balance summary for {username}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
