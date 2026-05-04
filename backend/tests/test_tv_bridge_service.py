import json
import unittest
from types import SimpleNamespace


class FakeRedis:
    def __init__(self, values=None):
        self.values = values or {}

    def hget(self, key, field):
        if key != "hx:prices":
            return None
        return self.values.get(field)


class FakeDb:
    def __init__(self):
        self.commits = 0

    def commit(self):
        self.commits += 1


class FakeBridgeClient:
    def __init__(self):
        self.placed = []
        self.cancelled = []
        self.closed = []
        self.accounts = [{"id": "D18156785", "name": "APEX-001"}]
        self.orders = [{"id": "OID-1", "status": "working"}, {"id": "OID-2", "status": "filled"}]
        self.positions = [{"id": "POS-1", "instrument": "MNQM6"}]

    def get_tv_accounts(self):
        return self.accounts

    def place_tv_order(self, **kwargs):
        self.placed.append(kwargs)
        return {"id": "ORDER-1", "status": "working", **kwargs}

    def get_tv_orders(self, account_id):
        assert account_id == "D18156785"
        return list(self.orders)

    def get_tv_positions(self, account_id):
        assert account_id == "D18156785"
        return list(self.positions)

    def cancel_tv_order(self, account_id, order_id):
        self.cancelled.append((account_id, order_id))
        return {"s": "ok"}

    def close_tv_position(self, account_id, position_id):
        self.closed.append((account_id, position_id))
        return {"s": "ok"}


class TVBridgeServiceTests(unittest.TestCase):
    def test_redis_quote_requires_bid_and_ask(self):
        from services.tv_bridge_service import RedisQuoteMissing, get_redis_quote

        redis_client = FakeRedis({
            "MNQM6": json.dumps({"symbol": "MNQM6", "price": 27782.75, "bid": 27780.0})
        })

        with self.assertRaisesRegex(RedisQuoteMissing, "bid/ask required"):
            get_redis_quote("MNQM6", redis_client=redis_client)

    def test_resolve_tv_account_id_maps_by_name_and_persists(self):
        from services.tv_bridge_service import resolve_tv_account_id

        db = FakeDb()
        client = FakeBridgeClient()
        account = SimpleNamespace(id=10, name="APEX-001", tv_account_id=None)

        tv_account_id = resolve_tv_account_id(db, account, client=client)

        self.assertEqual(tv_account_id, "D18156785")
        self.assertEqual(account.tv_account_id, "D18156785")
        self.assertEqual(db.commits, 1)

    def test_place_order_uses_redis_quote_and_bridge_payload(self):
        from services.tv_bridge_service import place_order_for_accounts

        redis_client = FakeRedis({
            "MNQM6": json.dumps({
                "symbol": "MNQM6",
                "price": 27782.75,
                "bid": 27780.0,
                "ask": 27795.25,
            })
        })
        db = FakeDb()
        client = FakeBridgeClient()
        account = SimpleNamespace(id=10, name="APEX-001", tv_account_id="D18156785")
        instrument = SimpleNamespace(symbol="MNQ", contract_month="MNQM6", id=5)

        report = place_order_for_accounts(
            db,
            accounts=[account],
            instrument=instrument,
            side="Buy",
            qty=2,
            order_type="Limit",
            limit_price=27840.25,
            stop_price=None,
            stop_loss=27700.0,
            take_profit=27900.0,
            duration_type="GTC",
            client=client,
            redis_client=redis_client,
        )

        self.assertEqual(report["success_count"], 1)
        self.assertEqual(client.placed, [{
            "account_id": "D18156785",
            "instrument": "MNQM6",
            "side": "buy",
            "qty": 2,
            "order_type": "limit",
            "limit_price": 27840.25,
            "stop_price": None,
            "stop_loss": 27700.0,
            "take_profit": 27900.0,
            "duration_type": "GTC",
            "current_ask": 27795.25,
            "current_bid": 27780.0,
        }])

    def test_flatten_account_cancels_working_orders_and_closes_positions(self):
        from services.tv_bridge_service import flatten_account

        db = FakeDb()
        client = FakeBridgeClient()
        account = SimpleNamespace(id=10, name="APEX-001", tv_account_id="D18156785")

        report = flatten_account(db, account, client=client)

        self.assertEqual(report["account_id"], 10)
        self.assertEqual(report["account"], "APEX-001")
        self.assertEqual(report["orders_cancelled"], [{"id": "OID-1", "status": "working"}])
        self.assertEqual(report["positions_flattened"], [{"id": "POS-1", "instrument": "MNQM6"}])
        self.assertEqual(client.cancelled, [("D18156785", "OID-1")])
        self.assertEqual(client.closed, [("D18156785", "POS-1")])


if __name__ == "__main__":
    unittest.main()
