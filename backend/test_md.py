import asyncio
import logging
from engine.market_feed import MarketFeedManager

logging.basicConfig(level=logging.INFO)

async def test():
    manager = MarketFeedManager()
    manager.active_symbols = {"MNQM6", "NQM6", "ESM6"}
    manager._initialized = True
    await manager.start()
    await asyncio.sleep(20)

if __name__ == "__main__":
    asyncio.run(test())
