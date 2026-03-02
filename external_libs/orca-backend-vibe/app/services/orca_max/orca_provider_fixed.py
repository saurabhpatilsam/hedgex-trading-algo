import json
import threading
import time
import os
import redis  # Synchronous Redis for pubsub
from datetime import datetime
from typing import Dict, Callable
from app.services.orca_max.helpers.enums import ENVIRONMENT
from app.services.orca_max.helpers.orca_helper import read_file_cleaned
from app.services.orca_supabase.orca_supabase import stream_ticks_keyset
from app.utils.logging_setup import logger
from dotenv import load_dotenv

load_dotenv()


class RedisPriceProvider:
    """Enhanced RedisPriceProvider with both streaming and direct price fetching"""

    def __init__(self, redis_client, environment, start_time, end_time, price_file: str = None):
        self.redis_client = redis_client  # Async client for regular operations
        self.environment = environment  # "prod" or "dev"
        self.price_file = price_file

        self.price_callbacks: Dict[str, Callable[[float], None]] = {}
        self.active_streams: Dict[str, bool] = {}

        # Cache latest prices for direct access
        self.latest_prices: Dict[str, float] = {}
        self.price_lock = threading.Lock()

        self.start_time = start_time
        self.end_time = end_time
        
        # Create synchronous Redis client for pubsub if in PROD
        self.sync_redis_client = None
        if environment == ENVIRONMENT.PROD.value:
            self._init_sync_redis()
    
    def _init_sync_redis(self):
        """Initialize synchronous Redis client for PubSub operations"""
        try:
            REDIS_HOST = os.getenv("REDIS_HOST")
            REDIS_PORT = os.getenv("REDIS_PORT", "6380")
            REDIS_PRIMARY_ACCESS_KEY = os.getenv("REDIS_PRIMARY_ACCESS_KEY")
            
            if not all([REDIS_HOST, REDIS_PORT, REDIS_PRIMARY_ACCESS_KEY]):
                logger.error("Missing Redis credentials for sync client")
                return
            
            # Create synchronous Redis client for PubSub
            self.sync_redis_client = redis.Redis(
                host=REDIS_HOST,
                port=int(REDIS_PORT),
                password=REDIS_PRIMARY_ACCESS_KEY,
                ssl=True,
                ssl_cert_reqs=None,
                decode_responses=True
            )
            
            # Test connection
            self.sync_redis_client.ping()
            logger.info(f"✅ Initialized sync Redis client for PubSub")
            
        except Exception as e:
            logger.error(f"Failed to initialize sync Redis client: {e}")
            self.sync_redis_client = None

    def get_price(self, instrument: str) -> float:
        """Get current/cached price for instrument"""
        with self.price_lock:
            if instrument in self.latest_prices:
                return self.latest_prices[instrument]

        if self.environment == ENVIRONMENT.PROD.value:
            return self._fetch_price_from_redis(instrument)
        elif self.environment == ENVIRONMENT.DEV.value or self.environment == ENVIRONMENT.DEV_SB.value:
            # In dev, just return cached price (or 0 if not started yet)
            return self.latest_prices.get(instrument, 0.0)
        else:
            return 0.0

    def _fetch_price_from_redis(self, instrument: str) -> float:
        """Fetch latest price from Redis (sync)"""
        try:
            # Use sync client for this operation
            if self.sync_redis_client:
                QUARTER_PERIOD = "Z5"  # TODO: automate year/quarter
                instrument_name = instrument.split(" ")[0]
                key = f"TRADOVATE_{instrument_name}{QUARTER_PERIOD}_LAST"
                price_str = self.sync_redis_client.get(key)
                if price_str:
                    return float(price_str)
        except Exception as e:
            logger.error(f"Error fetching price from Redis for {instrument}: {e}")
        return 0.0

    def register_price_callback(self, instrument: str, callback: Callable[[float], None]):
        """Register callback for price updates"""
        self.price_callbacks[instrument] = callback

    def subscribe_price_stream(self, instrument: str):
        """Start streaming prices for an instrument"""
        logger.info(f"Subscribing to price stream for {instrument} in {self.environment} mode")
        if instrument not in self.active_streams:
            self.active_streams[instrument] = True

            if self.environment == ENVIRONMENT.PROD.value:
                if not self.sync_redis_client:
                    logger.error("Sync Redis client not initialized for PROD streaming")
                    return
                
                target = self._price_stream_worker
                args = (instrument,)
            elif self.environment == ENVIRONMENT.DEV.value or self.environment == ENVIRONMENT.DEV_SB.value:
                if not self.price_file:
                    logger.error(f"No price file configured for {self.environment} environment")
                    return
                    
                target = self._file_stream_worker
                args = (instrument, self.price_file)
            else:
                raise ValueError(f"Unknown environment: {self.environment}")

            threading.Thread(
                target=target,
                args=args,
                daemon=True,
                name=f"PriceStream-{instrument}",
            ).start()

    def _price_stream_worker(self, instrument: str):
        """Worker thread for price streaming (prod/Redis) - SYNCHRONOUS"""
        if not self.sync_redis_client:
            logger.error("Sync Redis client not available for price streaming")
            return
            
        # Use synchronous pubsub
        redis_pubsub = self.sync_redis_client.pubsub()
        QUARTER_PERIOD = "Z5"  # TODO: automate year/quarter
        instrument_name = instrument.split(" ")[0]
        channel_name = f"TRADOVATE_{instrument_name}{QUARTER_PERIOD}_PRICE"
        
        # Subscribe synchronously
        redis_pubsub.subscribe(channel_name)
        logger.info(f"Started price stream worker for {channel_name}")

        try:
            while self.active_streams.get(instrument, False):
                # Get message synchronously
                message = redis_pubsub.get_message(timeout=1)
                if message and message["type"] == "message":
                    try:
                        _data = json.loads(message["data"])
                        price = float(_data["LAST"])
                        with self.price_lock:
                            self.latest_prices[instrument] = price
                        if instrument in self.price_callbacks:
                            self.price_callbacks[instrument](price)
                    except (json.JSONDecodeError, KeyError, ValueError) as e:
                        logger.error(f"Error parsing price data: {e}")
        except Exception as e:
            logger.error(f"Error in price stream worker for {instrument}: {e}")
        finally:
            # Close synchronously
            redis_pubsub.close()
            logger.info(f"Price stream worker stopped for {instrument}")

    def _file_stream_worker(self, instrument: str, price_file: str):
        """Simulate price stream from a file (dev environment)."""
        logger.info(f"Starting file stream for {instrument} from {price_file}")
        
        try:
            # Read price data from file
            price_data = read_file_cleaned(price_file)
            if not price_data:
                logger.error(f"No price data found in {price_file}")
                return
                
            # Stream prices with delay
            for row in price_data:
                if not self.active_streams.get(instrument, False):
                    break
                    
                try:
                    price = float(row.get("LAST", 0))
                    with self.price_lock:
                        self.latest_prices[instrument] = price
                    
                    if instrument in self.price_callbacks:
                        self.price_callbacks[instrument](price)
                        
                    time.sleep(0.1)  # Simulate real-time stream
                    
                except (KeyError, ValueError) as e:
                    logger.error(f"Error processing price data: {e}")
                    
        except Exception as e:
            logger.error(f"Error in file stream worker: {e}")
        finally:
            logger.info(f"File stream worker stopped for {instrument}")

    def unsubscribe_price_stream(self, instrument: str):
        """Stop streaming prices for an instrument"""
        if instrument in self.active_streams:
            self.active_streams[instrument] = False
            logger.info(f"Unsubscribed from price stream for {instrument}")
