from fastapi import FastAPI, Depends
from starlette.middleware.cors import CORSMiddleware

from app.api.health import health_router
from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.orca_max_router import max_router
from app.api.v1.bot_management_router import bot_router
from app.api.v1.account_balance_router import balance_router
from app.core.config import verify_key, VERSION, BASE_PATH
from app.middlewares.log import LogMiddleware
from app.middlewares.rootpath import RootPathMiddleware


from app.utils.logging_setup import logger
# No longer using Redis/SQLAlchemy - using Supabase instead
# from app.services.redis.redis_client import redis_client
# from app.db.database import init_db, close_db
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan events."""
    # Startup
    logger.info("Starting OrcaBot API Service...")
    try:
        # Initialize Redis
        from app.services.orca_redis.client import redis_client
        await redis_client.initialize()
        logger.info("✅ Redis initialized successfully")
        
        # Supabase client is initialized on module import
        logger.info("✅ OrcaBot API Service started successfully")
    except Exception as e:
        logger.error(f"❌ Failed to start services: {e}")
        # Continue anyway, some features may work
    
    yield
    
    # Shutdown
    logger.info("Shutting down OrcaBot API Service...")
    try:
        # Close Redis connection
        from app.services.orca_redis.client import redis_client
        await redis_client.close()
        
        # Supabase client cleanup happens automatically
        logger.info("✅ OrcaBot API Service shut down successfully")
    except Exception as e:
        logger.error(f"❌ Error during shutdown: {e}")

# Initialize FastAPI with lifespan
api_app = FastAPI(
    title="Trading Bot API",
    description="OrcaBot API Service with Bot Management",
    version=VERSION,
    # Don't use root_path here if you want /docs at the root
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Add middlewares correctly
api_app.add_middleware(LogMiddleware, logger=logger)
# If RootPathMiddleware is a class, you need to instantiate it
api_app.add_middleware(RootPathMiddleware)
# Add CORS middleware - THIS IS CRUCIAL

api_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
api_app.include_router(health_router, tags=["Health"])

# Auth router - no dependencies, public access for signup/signin
api_app.include_router(
    auth_router,
    prefix=f"{BASE_PATH}",
)

api_app.include_router(
    max_router,
    prefix=f"{BASE_PATH}",
    # dependencies=[Depends(verify_key)],
)

# Include bot management router (served at /api/bots/, not /api/v1/bots/)
api_app.include_router(
    bot_router,
    prefix=f"{BASE_PATH}",
    # dependencies=[Depends(verify_key)],  # Uncomment for production
)

# Include account balance router (served at /api/accounts/)
api_app.include_router(
    balance_router,

    # No prefix - router already has /api/accounts prefix defined
    # dependencies=[Depends(verify_key)],  # Uncomment for production
)



@api_app.get("/")
def read_root():
    return {"service": "Orca bot", "version": VERSION, "documentation": "/docs"}


@api_app.get("/debug/routes")
def debug_routes():
    """Debug endpoint to show all registered routes"""
    routes = []
    for route in api_app.routes:
        if hasattr(route, "methods") and hasattr(route, "path"):
            routes.append({
                "path": route.path,
                "methods": list(route.methods),
                "name": route.name
            })
    return {"total_routes": len(routes), "routes": routes}
