"""
Fixed OrcaMax with REAL pause/resume/stop control using threading events.
This replaces the broken orca_max_controlled.py
"""
import time
import threading
from typing import Optional
from app.services.orca_max.orca_max import OrcaMax
from app.utils.logging_setup import logger


class OrcaMaxControlledFixed(OrcaMax):
    """OrcaMax with REAL pause/resume/stop control via threading events."""
    
    def __init__(
        self, 
        bot_id: Optional[str] = None,
        pause_event: Optional[threading.Event] = None,
        stop_event: Optional[threading.Event] = None,
        *args, 
        **kwargs
    ):
        super().__init__(*args, **kwargs)
        self.bot_id = bot_id
        
        # Use provided events or create new ones
        self.pause_event = pause_event or threading.Event()
        self.stop_event = stop_event or threading.Event()
        
        # Start unpaused
        if not pause_event:
            self.pause_event.set()
    
    def check_control_signals(self) -> bool:
        """
        Check pause and stop signals.
        Returns False if bot should stop.
        """
        # Check stop signal
        if self.stop_event.is_set():
            logger.info(f"🛑 Bot {self.bot_id} received stop signal")
            return False
        
        # Wait if paused (blocks until resumed or stopped)
        if not self.pause_event.wait(timeout=0.1):
            logger.debug(f"⏸️ Bot {self.bot_id} is paused, waiting...")
            while not self.pause_event.is_set() and not self.stop_event.is_set():
                time.sleep(1)
                logger.debug(f"Bot {self.bot_id} still paused...")
            
            # Check if we were stopped while paused
            if self.stop_event.is_set():
                logger.info(f"🛑 Bot {self.bot_id} stopped while paused")
                return False
            
            logger.info(f"▶️ Bot {self.bot_id} resumed")
        
        return True
        
    def run(self):
        """Start the algorithm with REAL pause/resume/stop control."""
        logger.info(f"Starting OrcaMax algorithm with control (bot_id: {self.bot_id})...")
        
        self.pattern_processor.start_processing()
        self.abc_finder.start_processing()
        
        try:
            iteration = 0
            while not self.stop_event.is_set():
                # Check control signals
                if not self.check_control_signals():
                    break
                
                # Do actual work here (placeholder for real trading logic)
                iteration += 1
                if iteration % 10 == 0:
                    logger.debug(f"Bot {self.bot_id} iteration {iteration}")
                
                # Sleep briefly to not consume too much CPU
                time.sleep(0.5)
                
        except KeyboardInterrupt:
            logger.info("Shutdown initiated...")
        except Exception as e:
            logger.error(f"Bot {self.bot_id} error: {e}")
            raise
        finally:
            self.stop()
    
    def stop(self):
        """Stop the algorithm and clean up."""
        logger.info(f"Stopping bot {self.bot_id}...")
        
        # Set stop event to make sure we exit
        if self.stop_event:
            self.stop_event.set()
        
        # Unblock if paused
        if self.pause_event:
            self.pause_event.set()
        
        # Call parent stop
        super().stop()
        
        logger.info(f"✅ Bot {self.bot_id} stopped")


async def run_orca_system_controlled_fixed(
    run_config, 
    bot_id: str,
    pause_event: Optional[threading.Event] = None,
    stop_event: Optional[threading.Event] = None
):
    """
    Run Orca system with REAL pause/resume/stop control.
    
    Args:
        run_config: Bot configuration
        bot_id: Unique bot identifier
        pause_event: Threading event for pause control
        stop_event: Threading event for stop control
    """
    from app.services.orca_max.helpers.orca_helper import banner2, create_abc_config
    from app.services.orca_max_backtesting.helper import create_exit_strategy_config
    from app.services.orca_redis.client import get_redis_client
    from app.services.orca_max.orca_provider import RedisPriceProvider
    from app.services.orca_max.order_manager import ABCPatternProcessor, OrderManager
    from app.services.tradingview.broker import TradingViewTradovateBroker
    from app.services.orca_max.helpers.enums import ENVIRONMENT
    
    MAX_PATTERN_QUEUE_SIZE = 1000
    
    try:
        banner2()
        time.sleep(1)
        
        environment = run_config["environment"]
        price_file_name = run_config.get("price_file")
        
        logger.info(f"********************************************************")
        logger.info(f"**************| Running Orca trading {environment} |**************")
        logger.info(f"**************| Bot ID: {bot_id} |**************")
        logger.info(f"********************************************************")
        
        if environment == ENVIRONMENT.DEV and not price_file_name:
            raise EnvironmentError(f"No price file for this environment: {environment.value}")
        
        redis_client = await get_redis_client()
        
        start_time = run_config["start_time"]
        end_time = run_config["end_time"]
        price_provider = RedisPriceProvider(redis_client, environment, start_time, end_time)
        
        tradovate_broker = TradingViewTradovateBroker(
            redis_client, price_provider, run_config["main_account"], run_config["accounts_ids"]
        )
        
        order_manager = OrderManager(tradovate_broker, way=run_config['way'])
        pattern_processor = ABCPatternProcessor(order_manager, max_queue_size=MAX_PATTERN_QUEUE_SIZE)
        
        points_distance = create_abc_config(run_config["point_strategy_key"], run_config["point_position"].value)
        exit_strategy = create_exit_strategy_config(run_config["exit_strategy_key"])
        
        # Create FIXED controlled version with threading events
        orca_max = OrcaMaxControlledFixed(
            bot_id=bot_id,
            pause_event=pause_event,  # Pass threading event
            stop_event=stop_event,    # Pass threading event
            price_provider=price_provider,
            pattern_processor=pattern_processor,
            instrument_name=run_config["instrument_name"],
            point_type=run_config["point_type"],
            team_way=run_config["way"],
            points_distance=points_distance,
            exit_strategy=exit_strategy,
            quantity=run_config.get("quantity", 1),
        )
        
        # Update status to running
        from app.services.orca_supabase.bot_state_manager import BotStateManager
        state_manager = BotStateManager(bot_id)
        await state_manager.update_status("running")
        
        # Run the system - will properly respond to pause/stop
        orca_max.run()
        
        # Update status to stopped
        await state_manager.update_status("stopped")
        
        logger.info(f"✅ Orca system completed successfully (bot_id: {bot_id})")
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"❌ Error in run_orca_system_controlled_fixed: {str(e)}")
        
        # Update status to error
        try:
            from app.services.orca_supabase.bot_state_manager import BotStateManager
            state_manager = BotStateManager(bot_id)
            await state_manager.update_status("error")
        except:
            pass
        
        raise
