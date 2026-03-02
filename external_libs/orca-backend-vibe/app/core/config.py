import os
import toml
from typing import Optional
from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

BASE_PATH = "/api/v1"
HOST: str = "0.0.0.0"
PORT: int = int(os.getenv("PORT", "8000"))
COMMIT_SHA: str = os.getenv("COMMIT_SHA", "unknown")

# TODO: get it from the Secret Manager
API_KEY = os.getenv("API_KEY", "ss")
PROJECT_NAME: str = "ORCA BOT"

# Environment configuration
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()  # development, testing, production

# Dev/Test token - only works in non-production environments
DEV_TOKEN = os.getenv("DEV_TOKEN", "dev-token-12345")  # Change this in .env
ALLOW_DEV_TOKEN = ENVIRONMENT in ["development", "testing"]

 
def get_version_from_pyproject_toml(file_path: str) -> Optional[str]:
    """
    Try to read version from pyproject.toml file.
    Returns None if file doesn't exist or version not found.
    """
    try:
        with open(file_path, "r") as f:
            pyproject_toml = toml.load(f)
            # Check if there's a version specified in pyproject.toml
            if (
                "tool" in pyproject_toml
                and "poetry" in pyproject_toml["tool"]
                and "version" in pyproject_toml["tool"]["poetry"]
            ):
                return pyproject_toml["tool"]["poetry"]["version"]
    except (FileNotFoundError, IOError, KeyError):
        pass
    return None


def get_version() -> str:
    """
    Get application version from multiple sources in order of preference:
    1. VERSION environment variable
    2. pyproject.toml file (try multiple paths)
    3. Default version
    """
    # First, try environment variable
    env_version = os.getenv("VERSION")
    if env_version:
        return env_version
    
    # Try different possible paths for pyproject.toml
    possible_paths = [
        "../pyproject.toml",           # Development
        "pyproject.toml",               # Current directory
        "/home/site/wwwroot/pyproject.toml",  # Azure App Service
    ]
    
    for path in possible_paths:
        version = get_version_from_pyproject_toml(path)
        if version:
            return version
    
    # Fallback to default
    return "1.0.0"


API_KEY_NAME = "api-key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=True)


async def verify_key(api_key: str = Security(api_key_header)):
    if api_key != API_KEY:
        raise HTTPException(status_code=403, detail="api-key header invalid")
    return api_key


VERSION = get_version()
