"""
Enhanced OrcaMax with pause/resume/stop control.
"""
import time
import threading
from typing import Optional
from app.services.orca_max.orca_max import OrcaMax
from app.services.orca_max.bot_controller import BotController
from app.utils.logging_setup import logger


class OrcaMaxControlled(OrcaMax):
    """OrcaMax with pause/resume/stop control via Supabase."""
    
    def __init__(self, bot_id: Optional[str] = None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.bot_id = bot_id
        self.controller = BotController(bot_id) if bot_id else None
        
    def run(self):
        """Start the algorithm with pause/resume/stop control."""
        logger.info(f"Starting OrcaMax algorithm with control (bot_id: {self.bot_id})...")
        
        self.pattern_processor.start_processing()
        self.abc_finder.start_processing()
        
        try:
            while not self.stop_event.is_set():
                # Check if we have a controller
                if self.controller:
                    # This will block if paused, or raise StopIteration if stopped
                    try:
                        self.controller.wait_if_paused()
                        
                        # Check if we should continue
                        if not self.controller.should_continue():
                            logger.info(f"Bot {self.bot_id} stopping due to control signal")
                            break
                    except StopIteration as e:
                        logger.info(f"Bot stopped: {e}")
                        break
                
                # Continue normal operation
                time.sleep(1)
                
        except KeyboardInterrupt:
            logger.info("Shutdown initiated...")
        finally:
            self.stop()
    
    def stop(self):
        """Stop the algorithm and update status."""
        super().stop()
        
        # Update status in Supabase if we have a controller
        if self.controller and self.bot_id:
            try:
                from app.services.orca_supabase.bot_supabase import BotSupabase
                BotSupabase.update_bot_status(self.bot_id, "stopped")
                logger.info(f"Updated bot {self.bot_id} status to stopped")
            except Exception as e:
                logger.error(f"Failed to update bot status: {e}")


async def run_orca_system_with_control(run_config, bot_id):
    """
    Run Orca system with pause/resume/stop control.
    This replaces the standard run_orca_system when bot control is needed.
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
        logger.info(f"**************| Running Orca trading {environment} with control |**************")
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
        
        # Create CONTROLLED version with bot_id
        orca_max = OrcaMaxControlled(
            bot_id=bot_id,  # Pass bot_id for control
            price_provider=price_provider,
            pattern_processor=pattern_processor,
            instrument_name=run_config["instrument_name"],
            point_type=run_config["point_type"],
            team_way=run_config["way"],
            points_distance=points_distance,
            exit_strategy=exit_strategy,
            quantity=run_config.get("quantity", 1),
        )
        
        # Run the system - will check for pause/stop
        orca_max.run()
        
        logger.info(f"Orca system completed successfully")
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Error in run_orca_system_with_control: {str(e)}")
        raise
