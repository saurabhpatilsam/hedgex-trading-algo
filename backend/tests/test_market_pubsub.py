import json
import unittest


class MarketPubSubTests(unittest.TestCase):
    def test_tradovate_price_channel_normalizes_uppercase_payload(self):
        from routers.market import decode_pubsub_message

        tick = decode_pubsub_message({
            "type": "pmessage",
            "channel": "TRADOVATE_ESM6_PRICE",
            "data": json.dumps({
                "LAST": 7342.25,
                "BID": 7342.0,
                "ASK": 7342.5,
                "VOLUME": 1204,
                "UK_TIMESTAMP": "2026-05-07T20:00:01Z",
            }),
        })

        self.assertEqual(tick["symbol"], "ESM6")
        self.assertEqual(tick["price"], 7342.25)
        self.assertEqual(tick["last"], 7342.25)
        self.assertEqual(tick["bid"], 7342.0)
        self.assertEqual(tick["ask"], 7342.5)
        self.assertEqual(tick["volume"], 1204)
        self.assertEqual(tick["timestamp"], "2026-05-07T20:00:01Z")
        self.assertEqual(tick["channel"], "TRADOVATE_ESM6_PRICE")

    def test_tradovate_price_channel_accepts_raw_number_payload(self):
        from routers.market import decode_pubsub_message

        tick = decode_pubsub_message({
            "type": "pmessage",
            "channel": "TRADOVATE_MNQM6_PRICE",
            "data": "28184.25",
        })

        self.assertEqual(tick["symbol"], "MNQM6")
        self.assertEqual(tick["price"], 28184.25)


if __name__ == "__main__":
    unittest.main()
