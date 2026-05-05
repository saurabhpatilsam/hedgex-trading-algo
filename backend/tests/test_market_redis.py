import json
import os
import unittest
from unittest.mock import MagicMock, patch


class MarketRedisConfigTests(unittest.TestCase):
    def setUp(self):
        self._env = os.environ.copy()

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._env)

    def _clear_redis_env(self):
        for key in (
            "REDIS_URL",
            "REDIS_HOST",
            "REDIS_PORT",
            "REDIS_PASSWORD",
            "AZURE_REDIS_HOST",
            "AZURE_REDIS_PORT",
            "AZURE_REDIS_PASSWORD",
            "REDIS_SSL",
            "AZURE_REDIS_SSL",
        ):
            os.environ.pop(key, None)

    def test_build_redis_client_uses_url_when_available(self):
        from services import redis_config

        self._clear_redis_env()
        os.environ["REDIS_URL"] = "rediss://cache.example.com:6380/0"

        with patch.object(redis_config.redis, "from_url", return_value=MagicMock()) as from_url:
            redis_config.build_redis_client(socket_timeout=7, socket_connect_timeout=8)

        from_url.assert_called_once_with(
            "rediss://cache.example.com:6380/0",
            decode_responses=True,
            socket_timeout=7,
            socket_connect_timeout=8,
        )

    def test_build_redis_client_uses_configured_tls_host_without_url(self):
        from services import redis_config

        self._clear_redis_env()
        os.environ.update({
            "AZURE_REDIS_HOST": "orca.redis.cache.windows.net",
            "AZURE_REDIS_PORT": "6380",
            "AZURE_REDIS_PASSWORD": "secret",
        })

        with patch.object(redis_config.redis, "Redis", return_value=MagicMock()) as redis_ctor:
            redis_config.build_redis_client(socket_timeout=3, socket_connect_timeout=4)

        redis_ctor.assert_called_once_with(
            host="orca.redis.cache.windows.net",
            port=6380,
            password="secret",
            decode_responses=True,
            socket_timeout=3,
            socket_connect_timeout=4,
            ssl=True,
            ssl_cert_reqs=None,
        )

    def test_decode_price_hash_ignores_bad_entries(self):
        from routers.market import decode_price_hash

        prices = decode_price_hash({
            "MNQM6": json.dumps({"symbol": "MNQM6", "price": 27782.75, "bid": 27780.0, "ask": 27795.25}),
            "BAD": "not-json",
        })

        self.assertEqual(set(prices), {"MNQM6"})
        self.assertEqual(prices["MNQM6"]["price"], 27782.75)


if __name__ == "__main__":
    unittest.main()
