import uvicorn

from app.orca_api import api_app
from app.core.config import HOST, PORT, VERSION
from app.utils.logging_setup import logger


# # ahs
if __name__ == "__main__":
    logger.info(f"Starting LOCALLY OSINT API Server on {PORT}: {VERSION}")
    uvicorn.run("app.orca_api:api_app", host=HOST, port=PORT, reload=True)
