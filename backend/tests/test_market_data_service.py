import json
import unittest


class FakePipeline:
    def __init__(self):
        self.commands = []

    def hset(self, *args):
        self.commands.append(("hset", args))

    def publish(self, *args):
        self.commands.append(("publish", args))

    def lpush(self, *args):
        self.commands.append(("lpush", args))

    def ltrim(self, *args):
        self.commands.append(("ltrim", args))

    def execute(self):
        self.commands.append(("execute", ()))


class FakeRedis:
    def __init__(self):
        self.pipe = FakePipeline()

    def pipeline(self):
        return self.pipe


class MarketDataServiceParserTests(unittest.TestCase):
    def test_ws_authorize_uses_json_string_md_token(self):
        from services.tradovate_md_auth import build_ws_authorize_message

        self.assertEqual(
            build_ws_authorize_message(12, "md-token"),
            'authorize\n12\n\n"md-token"',
        )

    def test_renew_market_data_token_extracts_md_token(self):
        from services.tradovate_md_auth import renew_market_data_token

        class FakeResponse:
            def read(self):
                return b'{"accessToken":"rest-token-2","mdAccessToken":"md-token-2"}'

        def fake_open(req, timeout):
            self.assertIn("/auth/renewaccesstoken", req.full_url)
            self.assertEqual(req.get_header("Authorization"), "Bearer rest-token-1")
            self.assertEqual(timeout, 15)
            return FakeResponse()

        tokens = renew_market_data_token("rest-token-1", opener=fake_open)

        self.assertEqual(tokens["access_token"], "rest-token-2")
        self.assertEqual(tokens["md_access_token"], "md-token-2")

    def test_md_quote_envelope_with_offer_publishes_hx_tick(self):
        from services.market_data_service import MarketDataService

        service = object.__new__(MarketDataService)
        service.redis = FakeRedis()
        service.authorized = True
        service.last_prices = {}
        service._contract_map = {4327110: "MNQM6"}
        service._tick_count = 0

        service._handle_json_data({
            "e": "md",
            "d": {
                "quotes": [{
                    "contractId": 4327110,
                    "entries": {
                        "Bid": {"price": 28138.25, "size": 3},
                        "Offer": {"price": 28138.50, "size": 1},
                        "Trade": {"price": 28138.50, "size": 1},
                        "TotalTradeVolume": {"size": 1155839},
                        "HighPrice": {"price": 28155.0},
                        "LowPrice": {"price": 27727.5},
                    },
                }]
            },
        })

        commands = service.redis.pipe.commands
        hset = next(cmd for cmd in commands if cmd[0] == "hset")
        publish = next(cmd for cmd in commands if cmd[0] == "publish")
        tick = json.loads(hset[1][2])

        self.assertEqual(hset[1][0], "hx:prices")
        self.assertEqual(hset[1][1], "MNQM6")
        self.assertEqual(publish[1][0], "hx:ticks")
        self.assertEqual(tick["symbol"], "MNQM6")
        self.assertEqual(tick["price"], 28138.50)
        self.assertEqual(tick["bid"], 28138.25)
        self.assertEqual(tick["ask"], 28138.50)
        self.assertEqual(tick["volume"], 1155839)
        self.assertEqual(tick["high"], 28155.0)
        self.assertEqual(tick["low"], 27727.5)

    def test_quote_only_update_keeps_last_trade_price(self):
        from services.market_data_service import MarketDataService

        service = object.__new__(MarketDataService)
        service.redis = FakeRedis()
        service.authorized = True
        service.last_prices = {"MNQM6": {"price": 28138.50}}
        service._contract_map = {4327110: "MNQM6"}
        service._tick_count = 0

        service._handle_json_data({
            "e": "md",
            "d": {
                "quotes": [{
                    "contractId": 4327110,
                    "entries": {
                        "Bid": {"price": 28138.25, "size": 5},
                        "Offer": {"price": 28138.75, "size": 2},
                    },
                }]
            },
        })

        hset = next(cmd for cmd in service.redis.pipe.commands if cmd[0] == "hset")
        tick = json.loads(hset[1][2])

        self.assertEqual(tick["price"], 28138.50)
        self.assertEqual(tick["bid"], 28138.25)
        self.assertEqual(tick["ask"], 28138.75)


if __name__ == "__main__":
    unittest.main()
