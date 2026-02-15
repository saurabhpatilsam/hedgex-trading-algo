from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routers import accounts, groups, instruments, strategy


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Hedging Trading Algorithm",
    description="POT-based hedging strategy with mirrored Long/Short positions",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(accounts.router)
app.include_router(groups.router)
app.include_router(instruments.router)
app.include_router(strategy.router)


@app.get("/")
def root():
    return {"message": "Hedging Trading Algorithm API", "docs": "/docs"}
