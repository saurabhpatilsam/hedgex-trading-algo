"""
Centralized authentication dependencies for all API endpoints
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional

from app.services.auth.models import UserResponse
from app.services.auth.service import AuthService
from app.core.config import ALLOW_DEV_TOKEN, DEV_TOKEN, ENVIRONMENT

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> UserResponse:
    """
    Dependency to get the current authenticated user from JWT token or dev token.
    Use this for any endpoint that requires authentication.
    
    Supports two authentication methods:
    1. JWT token from login (works in all environments)
    2. Dev token (only works in development/testing environments)
    
    Args:
        credentials: HTTP Bearer token from Authorization header
        
    Returns:
        UserResponse: The authenticated user
        
    Raises:
        HTTPException: If token is invalid or expired
    """
    token = credentials.credentials
    
    # First, try to validate as JWT token
    user = AuthService.validate_session(token)
    
    if user:
        return user
    
    # If JWT validation failed and we're in dev/test environment, check for dev token
    if ALLOW_DEV_TOKEN and token == DEV_TOKEN:
        # Log dev token usage for debugging
        from app.utils.logging_setup import logger
        logger.warning(f"⚠️  DEV TOKEN used for authentication (Environment: {ENVIRONMENT})")
        return _get_dev_user()
    
    # Both authentication methods failed
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _get_dev_user() -> UserResponse:
    """
    Get or create a development user for dev token authentication.
    This user is used when authenticating with DEV_TOKEN in non-production environments.
    
    Returns:
        UserResponse: A dev/test user
    """
    # Try to get the first confirmed user from the database
    try:
        users = AuthService.get_all_users()
        confirmed_users = [u for u in users if u.confirmed and u.is_active]
        
        if confirmed_users:
            # Return the first confirmed user
            return confirmed_users[0]
    except Exception:
        pass
    
    # If no users exist, return a mock dev user
    # Note: This won't exist in the database but allows dev testing
    from datetime import datetime, timezone
    return UserResponse(
        id="00000000-0000-0000-0000-000000000000",
        email="dev@orca.local",
        name="Dev User",
        confirmed=True,
        is_active=True,
        created_at=datetime.now(timezone.utc).isoformat(),
        last_login=None,
        updated_at=None
    )


async def get_current_confirmed_user(
    current_user: UserResponse = Depends(get_current_user)
) -> UserResponse:
    """
    Dependency to ensure the user is confirmed.
    Use this for endpoints that require account confirmation.
    
    Args:
        current_user: The authenticated user
        
    Returns:
        UserResponse: The confirmed user
        
    Raises:
        HTTPException: If account is not confirmed
    """
    if not current_user.confirmed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account not confirmed. Please contact administrator."
        )
    
    return current_user


async def get_current_active_user(
    current_user: UserResponse = Depends(get_current_user)
) -> UserResponse:
    """
    Dependency to ensure the user is active.
    Use this for endpoints that require an active account.
    
    Args:
        current_user: The authenticated user
        
    Returns:
        UserResponse: The active user
        
    Raises:
        HTTPException: If account is not active
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been deactivated"
        )
    
    return current_user
