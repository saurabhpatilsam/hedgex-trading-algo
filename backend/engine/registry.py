"""
StrategyRegistry — Maps strategy type strings to their Python classes.

Usage:
    StrategyRegistry.register("HEDGING", HedgingStrategy)
    cls = StrategyRegistry.get("HEDGING")
    instance = cls(db, strategy_id, config)
"""

import logging
from typing import Dict, Type

from engine.base import BaseStrategy

logger = logging.getLogger(__name__)

_REGISTRY: Dict[str, Type[BaseStrategy]] = {}


class StrategyRegistry:
    """Central registry for all available strategy types."""

    @staticmethod
    def register(strategy_type: str, strategy_class: Type[BaseStrategy]):
        """Register a strategy class under a type key."""
        _REGISTRY[strategy_type] = strategy_class
        logger.info(f"Registered strategy: {strategy_type} → {strategy_class.__name__}")

    @staticmethod
    def get(strategy_type: str) -> Type[BaseStrategy]:
        """Look up a strategy class by its type key."""
        cls = _REGISTRY.get(strategy_type)
        if not cls:
            raise ValueError(
                f"Unknown strategy type: '{strategy_type}'. "
                f"Available: {list(_REGISTRY.keys())}"
            )
        return cls

    @staticmethod
    def list_available() -> list[dict]:
        """Return metadata about all registered strategies."""
        result = []
        for key, cls in _REGISTRY.items():
            result.append({
                "type": key,
                "name": cls.STRATEGY_NAME,
                "description": cls.STRATEGY_DESCRIPTION,
                "parameter_schema": cls.PARAMETER_SCHEMA,
            })
        return result

    @staticmethod
    def is_registered(strategy_type: str) -> bool:
        return strategy_type in _REGISTRY


def auto_discover():
    """Import all strategy modules to trigger their @register decorators."""
    # Import strategies subpackage — each file registers itself
    import engine.strategies.hedging  # noqa: F401
    logger.info(f"Auto-discovered {len(_REGISTRY)} strategies: {list(_REGISTRY.keys())}")
