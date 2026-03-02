"""
Authentication endpoints
"""
from fastapi import APIRouter, HTTPException, Depends, status, Header, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional

from app.services.auth.models import (
    UserSignupRequest,
    UserSigninRequest,
    TokenResponse,
    UserResponse,
    ChangePasswordRequest,
    PasswordResetRequest,
    PasswordResetConfirm,
    EmailVerificationRequest,
    ResendVerificationRequest
)
from app.services.auth.service import AuthService
from app.api.dependencies import (
    get_current_user,
    get_current_confirmed_user,
    security
)

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup(signup_data: UserSignupRequest):
    """
    Register a new user account
    
    Note: User account will be created but NOT confirmed.
    An administrator must confirm the account before the user can log in.
    """
    user, error = AuthService.create_user(signup_data)
    
    if error:
        # raise error
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return user


@router.post("/signin", response_model=TokenResponse)
async def signin(
    signin_data: UserSigninRequest,
    request: Request
):
    """
    Sign in with email and password
    
    Returns JWT access token if credentials are valid and user is confirmed.
    """
    result, error = AuthService.authenticate_user(signin_data)
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error,
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Update session with request info
    # (This is a simplified version - you might want to update the session record)
    
    return result


@router.post("/signout")
async def signout(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Sign out the current user (invalidate session)
    """
    token = credentials.credentials
    success = AuthService.signout(token)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to sign out"
        )
    
    return {"message": "Successfully signed out"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Get current authenticated user information
    """
    return current_user


@router.get("/users", response_model=list[UserResponse])
async def get_all_users(
    current_user: UserResponse = Depends(get_current_confirmed_user)
):
    """
    Get all users (requires confirmed account)
    
    In production, you should add admin role checking here
    """
    users = AuthService.get_all_users()
    return users


@router.post("/users/{user_id}/confirm", response_model=UserResponse)
async def confirm_user(
    user_id: str,
    current_user: UserResponse = Depends(get_current_confirmed_user)
):
    """
    Confirm a user account (admin action)
    
    In production, you should add admin role checking here
    """
    user, error = AuthService.confirm_user(user_id)
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return user


@router.get("/users/{user_id}/permissions")
async def get_user_permissions(
    user_id: str,
    current_user: UserResponse = Depends(get_current_confirmed_user)
):
    """
    Get permissions for a specific user
    """
    # In production, check if current_user has permission to view this
    permissions = AuthService.get_user_permissions(user_id)
    
    return {"user_id": user_id, "permissions": permissions}


@router.get("/health")
async def auth_health():
    """
    Health check for auth service
    """
    return {"status": "healthy", "service": "authentication"}


@router.get("/config")
async def auth_config():
    """
    Get authentication configuration info (public endpoint for developers)
    Shows available authentication methods and environment info
    """
    from app.core.config import ENVIRONMENT, ALLOW_DEV_TOKEN
    
    config = {
        "environment": ENVIRONMENT,
        "authentication_methods": {
            "jwt": {
                "enabled": True,
                "description": "Login with email/password to get JWT token",
                "endpoint": "/api/v1/auth/signin"
            },
            "dev_token": {
                "enabled": ALLOW_DEV_TOKEN,
                "description": "Static token for development/testing only",
                "available_in": ["development", "testing"],
                "current_environment_allows": ALLOW_DEV_TOKEN,
                "usage": "Authorization: Bearer <DEV_TOKEN>" if ALLOW_DEV_TOKEN else "Not available in production"
            }
        },
        "note": "Dev token is only enabled in development and testing environments"
    }
    
    return config


@router.post("/password/reset-request")
async def request_password_reset(reset_request: PasswordResetRequest):
    """
    Request a password reset link
    
    Sends a password reset token to the user's email (if it exists).
    For security, always returns success even if email doesn't exist.
    
    In development: Returns the reset token in the response for testing
    In production: Token would be sent via email only
    """
    from app.core.config import ENVIRONMENT
    
    reset_token, error = AuthService.request_password_reset(reset_request.email)
    
    if error and "Failed" in error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error
        )
    
    # For development/testing, return the token
    # In production, this would only send email
    if ENVIRONMENT in ["development", "testing"] and reset_token:
        return {
            "message": "If the email exists, a reset link has been sent",
            "reset_token": reset_token,  # Only in dev/test
            "note": "In production, token is sent via email only"
        }
    
    return {
        "message": "If the email exists, a reset link has been sent"
    }


@router.post("/password/verify-token")
async def verify_password_reset_token(token: str):
    """
    Verify if a password reset token is valid
    
    Useful for checking token validity before showing password reset form
    """
    user_id, error = AuthService.verify_reset_token(token)
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return {
        "valid": True,
        "message": "Token is valid"
    }


@router.post("/password/reset")
async def reset_password(reset_data: PasswordResetConfirm):
    """
    Reset password using a valid reset token
    
    This invalidates all existing sessions for security
    """
    success, error = AuthService.reset_password(reset_data.token, reset_data.new_password)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return {
        "message": "Password reset successful. Please login with your new password.",
        "sessions_invalidated": True
    }


@router.post("/password/change")
async def change_password(
    change_request: ChangePasswordRequest,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Change password for logged-in user
    
    Requires authentication and current password verification
    """
    success, error = AuthService.change_password(
        str(current_user.id),
        change_request.old_password,
        change_request.new_password
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return {
        "message": "Password changed successfully"
    }


@router.post("/email/verify")
async def verify_email(token: str):
    """
    Verify user email with verification token
    
    This endpoint confirms the user's email address and activates their account
    """
    success, error = AuthService.verify_email(token)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return {
        "message": "Email verified successfully! You can now sign in.",
        "verified": True
    }


@router.post("/email/resend-verification")
async def resend_verification(request: ResendVerificationRequest):
    """
    Resend email verification link
    
    Sends a new verification token to the user's email
    In development: Returns the token in the response
    In production: Token is sent via email only
    """
    from app.core.config import ENVIRONMENT
    
    verification_token, error = AuthService.resend_verification_email(request.email)
    
    if error:
        # User-friendly errors
        if "not found" in error.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No account found with this email address"
            )
        elif "already verified" in error.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email is already verified"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error
            )
    
    # For development/testing, return the token
    # In production, this would only send email
    if ENVIRONMENT in ["development", "testing"] and verification_token:
        return {
            "message": "Verification email sent successfully",
            "verification_token": verification_token,  # Only in dev/test
            "note": "In production, token is sent via email only"
        }
    
    return {
        "message": "Verification email sent successfully"
    }
