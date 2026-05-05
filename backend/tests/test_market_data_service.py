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


if __name__ == "__main__":
    unittest.main()
