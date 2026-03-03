"""
Tradovate Client mimicking TradingView integration.
Allows login via username/password and fetching sub-accounts.

When proxy_url and user_id are set, ALL outbound requests are routed
through the Azure IP proxy VM so that Tradovate sees the user's
dedicated static IP address.
"""
import os
import requests
import urllib.parse
from typing import Optional, Dict, List, Any
import logging

# Set up logging
logger = logging.getLogger(__name__)

# Constants
AUTH_URL = "https://tv-demo.tradovateapi.com/authorize?locale=en"
ACCOUNTS_URL = "https://tv-demo.tradovateapi.com/accounts?locale=en"
TRADOVATE_ACCOUNT_LIST_URL = "https://demo.tradovateapi.com/v1/account/list"

TRADINGVIEW_ORIGIN = "https://www.tradingview.com"
TRADER_TRADOVATE_ORIGIN = "https://trader.tradovate.com"

# Proxy VM endpoints per region
PROXY_URLS = {
    "india": os.getenv("PROXY_URL_INDIA", "http://20.192.16.60:9000"),
    "uk": os.getenv("PROXY_URL_UK", "http://20.50.127.77:9000"),
}


class TradovateClient:
    def __init__(self, proxy_url: Optional[str] = None, user_id: Optional[int] = None):
        """
        Args:
            proxy_url: Base URL of the proxy VM (e.g. http://20.192.16.60:9000)
            user_id: The numeric user ID for IP routing through the proxy
        """
        self.session = requests.Session()
        self.access_token: Optional[str] = None
        self.username: Optional[str] = None
        self.proxy_url = proxy_url
        self.user_id = user_id

    def _log_request_to_db(self, method: str, url: str, status_code: int, request_payload: str, response_snippet: str):
        """Helper to log API request and response data to the database."""
        try:
            from database import SessionLocal
            from models import RequestLog
            from datetime import datetime, timezone

            db = SessionLocal()
            try:
                log_entry = RequestLog(
                    user_id=self.user_id,
                    method=method.upper(),
                    url=url,
                    status_code=status_code,
                    request_payload=request_payload[:2000] if request_payload else None,
                    response_snippet=response_snippet[:2000] if response_snippet else None,
                    timestamp=datetime.now(timezone.utc)
                )
                db.add(log_entry)
                db.commit()
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Failed to log request to DB: {e}")

    def _proxied_request(self, method: str, url: str, headers: Dict = None,
                         data: Any = None, json_body: Any = None,
                         timeout: int = 30) -> requests.Response:
        """Route a request through the proxy VM or send directly."""
        import json
        req_payload_str = ""
        if json_body is not None:
            req_payload_str = json.dumps(json_body)
        elif data is not None:
            req_payload_str = str(data)

        if self.proxy_url and self.user_id:
            # Send through proxy
            proxy_payload = {
                "user_id": self.user_id,
                "method": method.upper(),
                "url": url,
                "headers": headers or {},
                "timeout": timeout,
            }
            if json_body is not None:
                proxy_payload["body"] = json_body
            elif data is not None:
                proxy_payload["body"] = data

            logger.info(f"[PROXY user={self.user_id}] {method.upper()} {url} via {self.proxy_url}")
            resp = self.session.post(
                f"{self.proxy_url}/proxy",
                json=proxy_payload,
                timeout=timeout + 10,
            )
            resp.raise_for_status()
            proxy_result = resp.json()

            # Build a fake Response object from the proxy result
            fake_resp = requests.models.Response()
            fake_resp.status_code = proxy_result["status_code"]
            
            resp_body = proxy_result["body"]
            fake_resp._content = (
                json.dumps(resp_body).encode("utf-8")
                if isinstance(resp_body, (dict, list))
                else str(resp_body).encode("utf-8")
            )
            fake_resp.headers.update(proxy_result.get("headers", {}))
            
            # Log to DB
            resp_snippet_str = fake_resp._content.decode("utf-8") if fake_resp._content else ""
            self._log_request_to_db(method, url, fake_resp.status_code, req_payload_str, resp_snippet_str)

            return fake_resp
        else:
            # Direct request (no proxy)
            kwargs = {"headers": headers, "timeout": timeout}
            if json_body is not None:
                kwargs["json"] = json_body
            elif data is not None:
                kwargs["data"] = data
            
            resp = getattr(self.session, method.lower())(url, **kwargs)
            
            # Log to DB
            self._log_request_to_db(method, url, resp.status_code, req_payload_str, resp.text)
            
            return resp

    def _build_tv_headers(self) -> Dict[str, str]:
        """Common headers used for Tradovate TV endpoints (simulating browser)."""
        return {
            "Host": "tv-demo.tradovateapi.com",
            "Connection": "keep-alive",
            "sec-ch-ua-platform": '"macOS"',
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/136.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
            "sec-ch-ua": (
                '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"'
            ),
            "sec-ch-ua-mobile": "?0",
            "Origin": TRADINGVIEW_ORIGIN,
            "Sec-Fetch-Site": "cross-site",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
            "Referer": f"{TRADINGVIEW_ORIGIN}/",
            "Accept-Language": "en-US,en;q=0.9",
            "Content-Type": "application/x-www-form-urlencoded",
        }

    def _build_auth_payload(self, username: str, password: str) -> str:
        encoded_username = urllib.parse.quote(username)
        encoded_password = urllib.parse.quote(password)
        return f"locale=en&login={encoded_username}&password={encoded_password}"

    def login(self, username: str, password: str) -> tuple[Optional[str], Optional[str]]:
        """
        Authenticate with Tradovate.
        Returns (token, error_message).
        """
        self.username = username
        payload = self._build_auth_payload(username, password)
        headers = self._build_tv_headers()

        try:
            logger.info(f"Attempting login for user: {username}")
            response = self._proxied_request("POST", AUTH_URL, headers=headers, data=payload, timeout=15)
            
            if response.status_code != 200:
                 err_msg = f"Login HTTP Error {response.status_code}: {response.text}"
                 logger.error(err_msg)
                 return None, err_msg

            data = response.json()

            if data.get("s") == "ok":
                token = data.get("d", {}).get("access_token")
                if token:
                    self.access_token = token
                    logger.info(f"Login successful for {username}")
                    return token, None
                else:
                    err_msg = "Login successful but no token in response"
                    logger.error(err_msg)
                    return None, err_msg
            else:
                err_msg = f"Login failed: {data.get('errmsg')}"
                logger.error(err_msg)
                return None, err_msg

        except Exception as e:
            err_msg = f"Login error: {str(e)}"
            logger.error(err_msg)
            return None, err_msg
        
        return None, "Unknown error"

    def get_subaccounts(self) -> List[Dict[str, Any]]:
        """
        Fetch sub-accounts by merging data from TradingView account list
        and Tradovate account list (for status flags).
        Must be logged in.
        """
        if not self.access_token:
            raise ValueError("Not authenticated. Call login() first.")

        try:
            # 1. Get TradingView accounts (basic info)
            tv_accounts = self._get_tradingview_accounts()
            
            # 2. Get Tradovate accounts (status info)
            tradovate_accounts = self._get_tradovate_accounts()

            # 3. Merge them
            merged = self._merge_accounts(tv_accounts, tradovate_accounts)
            return merged

        except Exception as e:
            logger.error(f"Error fetching subaccounts: {e}")
            raise e

    def _get_tradingview_accounts(self) -> List[Dict[str, Any]]:
        headers = self._build_tv_headers()
        # Add auth header
        headers["Authorization"] = f"Bearer {self.access_token}"
        
        # Override headers specific to accounts endpoint if needed (from client.py)
        # client.py re-declares headers, but they look mostly same.
        # It adds Origin/Referer/Content-Type.
        
        try:
            response = self._proxied_request("GET", ACCOUNTS_URL, headers=headers, timeout=15)
            response.raise_for_status()
            data = response.json()
            
            if data.get("s") == "ok":
                return data.get("d", []) or []
            else:
                logger.error(f"TradingView accounts fetch failed: {data}")
                return []
        except Exception as e:
            logger.error(f"Error fetching TV accounts: {e}")
            raise e

    def _get_tradovate_accounts(self) -> List[Dict[str, Any]]:
        url = TRADOVATE_ACCOUNT_LIST_URL
        headers = {
            "accept": "*/*",
            "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
            "authorization": f"Bearer {self.access_token}",
            "origin": TRADER_TRADOVATE_ORIGIN,
            "referer": TRADER_TRADOVATE_ORIGIN,
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "cross-site",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        }

        try:
            response = self._proxied_request("GET", url, headers=headers, timeout=15)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching Tradovate accounts: {e}")
            # If this fails, we might still return basic TV accounts, but let's raise for now
            raise e

    def _merge_accounts(self, tv_accounts: List[Dict], tradovate_accounts: List[Dict]) -> List[Dict]:
        """Merge logic adapted from client.py"""
        # unexpected structure protection
        if not isinstance(tv_accounts, list):
            tv_accounts = []
        if not isinstance(tradovate_accounts, list):
            tradovate_accounts = []
            
        tradovate_by_name = {acc["name"]: acc for acc in tradovate_accounts if "name" in acc}
        
        merged = []
        for tv_acc in tv_accounts:
            name = tv_acc.get("name")
            t_acc = tradovate_by_name.get(name)
            
            account_data = {
                "name": name,
                "id": tv_acc.get("id"),
                "currency": tv_acc.get("currency"),
                "type": tv_acc.get("type"),
                "is_verified": tv_acc.get("isVerified"),
                "parent_username": self.username
            }
            
            if t_acc:
                account_data.update({
                    "tradovate_id": t_acc.get("id"),
                    "user_id": t_acc.get("userId"),
                    "account_type": t_acc.get("accountType"),
                    "active": t_acc.get("active", True),
                    "restricted": t_acc.get("restricted", False),
                    "closed": t_acc.get("closed", False),
                    "legal_status": t_acc.get("legalStatus"),
                    "margin_account_type": t_acc.get("marginAccountType"),
                    "timestamp": t_acc.get("timestamp")
                })
            else:
                # Default values if not found in tradovate list (e.g. simulation?)
                account_data.update({
                    "active": True,
                    "restricted": False,
                    "closed": False
                })
            
            merged.append(account_data)
            
        return merged

    def get_account_balance(self, account_id: str) -> Dict[str, Any]:
        """
        Fetch account state (balance, equity, etc.) for a specific account.
        Endpoint: /accounts/{account_id}/state
        """
        if not self.access_token:
            raise ValueError("Not authenticated.")
        
        url = f"https://tv-demo.tradovateapi.com/accounts/{account_id}/state?locale=en"
        headers = self._build_tv_headers()
        headers["Authorization"] = f"Bearer {self.access_token}"
        
        try:
            response = self._proxied_request("GET", url, headers=headers, timeout=15)
            response.raise_for_status()
            data = response.json()
            
            if data.get("s") == "ok":
                return data.get("d", {})
            else:
                logger.error(f"Failed to fetch balance for {account_id}: {data}")
                return {}
        except Exception as e:
            logger.error(f"Error fetching balance for {account_id}: {e}")
            return {}

    def search_contracts(self, text: str, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Search for active contracts by ticker (e.g., 'NQ', 'ES').
        Endpoint: /v1/contract/suggest?t={text}&l={limit}
        Must be logged in.
        """
        if not self.access_token:
            raise ValueError("Not authenticated.")
            
        url = f"https://demo.tradovateapi.com/v1/contract/suggest?t={text}&l={limit}"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json"
        }
        
        try:
            response = self._proxied_request("GET", url, headers=headers, timeout=15)
            response.raise_for_status()
            return response.json()  # Returns list of contracts like [{'id': 4086428, 'name': 'NQH6', ...}]
        except Exception as e:
            logger.error(f"Error searching contracts for {text}: {e}")
            return []

    def place_order(
        self,
        account_id: int,
        account_spec: str,
        symbol: str,
        action: str,
        qty: int = 1,
        order_type: str = "Market",
    ) -> Dict[str, Any]:
        """
        Place an order via Tradovate API.
        
        Args:
            account_id: Tradovate numeric account ID
            account_spec: Account name/spec string (e.g. 'PAAPEX2659950000005')
            symbol: Contract symbol (e.g. 'MNQH6')
            action: 'Buy' or 'Sell'
            qty: Order quantity (number of contracts)
            order_type: 'Market', 'Limit', 'Stop', etc.
        
        Returns: Order response dict from Tradovate
        """
        if not self.access_token:
            raise ValueError("Not authenticated.")

        url = "https://demo.tradovateapi.com/v1/order/placeOrder"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        payload = {
            "accountSpec": account_spec,
            "accountId": account_id,
            "action": action,  # "Buy" or "Sell"
            "symbol": symbol,
            "orderQty": qty,
            "orderType": order_type,
            "isAutomated": True,
        }

        logger.info(f"Placing order: {action} {qty}x {symbol} on account {account_spec} (id={account_id})")

        try:
            response = self._proxied_request("POST", url, headers=headers, json_body=payload, timeout=30)
            response.raise_for_status()
            result = response.json()
            logger.info(f"Order placed successfully: {result}")
            return result
        except Exception as e:
            logger.error(f"Error placing order: {e}")
            # Try to get error details from response
            try:
                error_detail = response.json() if response else {}
            except Exception:
                error_detail = {}
            raise RuntimeError(f"Order placement failed: {e}. Details: {error_detail}")

    def cancel_order(self, order_id: int) -> Dict[str, Any]:
        """
        Cancel an existing order.
        Endpoint: /v1/order/cancelorder
        """
        if not self.access_token:
            raise ValueError("Not authenticated.")

        url = "https://demo.tradovateapi.com/v1/order/cancelorder"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        payload = {"orderId": order_id}

        try:
            response = self._proxied_request("POST", url, headers=headers, json_body=payload, timeout=15)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error cancelling order {order_id}: {e}")
            raise RuntimeError(f"Order cancellation failed: {e}")

    def get_positions(self, account_id: int) -> List[Dict[str, Any]]:
        """
        Get open positions for an account.
        Endpoint: /v1/position/list
        """
        if not self.access_token:
            raise ValueError("Not authenticated.")

        url = "https://demo.tradovateapi.com/v1/position/list"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json",
        }

        try:
            response = self._proxied_request("GET", url, headers=headers, timeout=15)
            response.raise_for_status()
            positions = response.json()
            # Filter by account
            return [p for p in positions if p.get("accountId") == account_id]
        except Exception as e:
            logger.error(f"Error fetching positions for account {account_id}: {e}")
            return []

    def get_orders(self, account_id: int) -> List[Dict[str, Any]]:
        """
        Get all orders for an account.
        Endpoint: /v1/order/list
        """
        if not self.access_token:
            raise ValueError("Not authenticated.")

        url = "https://demo.tradovateapi.com/v1/order/list"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json",
        }

        try:
            response = self._proxied_request("GET", url, headers=headers, timeout=15)
            response.raise_for_status()
            orders = response.json()
            return [o for o in orders if o.get("accountId") == account_id]
        except Exception as e:
            logger.error(f"Error fetching orders for account {account_id}: {e}")
            return []

    def flatten_account(self, account_id: int, account_spec: str) -> Dict[str, Any]:
        """
        FLATTEN an account: cancel all working orders + close all positions.
        This is the nuclear 'KILL THEM ALL' operation.
        
        Steps:
          1. Get all working (non-filled) orders → cancel each
          2. Get all positions with netPos != 0 → place opposing market orders
        
        Returns a report of what was done.
        """
        if not self.access_token:
            raise ValueError("Not authenticated.")

        report = {
            "account": account_spec,
            "orders_cancelled": [],
            "positions_flattened": [],
            "errors": [],
        }

        # 1. Cancel all working orders
        orders = self.get_orders(account_id)
        working_statuses = {"Working", "Accepted", "PendingNew", "Suspended"}
        for order in orders:
            status = order.get("ordStatus", "")
            if status in working_statuses:
                order_id = order.get("id")
                try:
                    self.cancel_order(order_id)
                    report["orders_cancelled"].append({
                        "orderId": order_id,
                        "status": "cancelled",
                    })
                    logger.info(f"Cancelled order {order_id}")
                except Exception as e:
                    report["errors"].append(f"Cancel order {order_id}: {e}")
                    logger.error(f"Failed to cancel order {order_id}: {e}")

        # 2. Flatten all positions
        positions = self.get_positions(account_id)
        for pos in positions:
            net_pos = pos.get("netPos", 0)
            if net_pos == 0:
                continue

            contract_id = pos.get("contractId")
            # We need the symbol to place the closing order
            # Try to resolve it from the contract
            action = "Sell" if net_pos > 0 else "Buy"
            qty = abs(net_pos)

            # Search for the contract to get the symbol
            try:
                # Use the contract/item endpoint to get the symbol
                url = f"https://demo.tradovateapi.com/v1/contract/item?id={contract_id}"
                headers = {
                    "Authorization": f"Bearer {self.access_token}",
                    "Accept": "application/json",
                }
                resp = self._proxied_request("GET", url, headers=headers, timeout=10)
                resp.raise_for_status()
                contract_data = resp.json()
                symbol = contract_data.get("name", "")
                
                if not symbol:
                    report["errors"].append(f"No symbol for contract {contract_id}")
                    continue

                logger.info(f"Flattening: {action} {qty}x {symbol} (contractId={contract_id})")
                result = self.place_order(
                    account_id=account_id,
                    account_spec=account_spec,
                    symbol=symbol,
                    action=action,
                    qty=qty,
                )
                report["positions_flattened"].append({
                    "symbol": symbol,
                    "action": action,
                    "qty": qty,
                    "orderId": result.get("orderId"),
                })
            except Exception as e:
                report["errors"].append(f"Flatten {contract_id}: {e}")
                logger.error(f"Failed to flatten contractId {contract_id}: {e}")

        logger.info(
            f"Flatten complete for {account_spec}: "
            f"{len(report['orders_cancelled'])} orders cancelled, "
            f"{len(report['positions_flattened'])} positions flattened, "
            f"{len(report['errors'])} errors"
        )
        return report


def get_proxied_client(user=None, user_id: int = None, proxy_region: str = None) -> TradovateClient:
    """
    Factory: create a TradovateClient that routes through the user's proxy IP.

    Usage from routers:
        from required_api.tradovate_client import get_proxied_client
        client = get_proxied_client(user=user_obj)
        # or
        client = get_proxied_client(user_id=1, proxy_region='india')

    If no user/region, returns a direct (non-proxied) client.
    """
    uid = None
    region = None

    if user is not None:
        uid = user.id
        region = getattr(user, 'proxy_region', None)
    elif user_id is not None:
        uid = user_id
        region = proxy_region

    if uid and region and region in PROXY_URLS:
        proxy_url = PROXY_URLS[region]
        logger.info(f"Creating proxied client: user={uid}, region={region}, proxy={proxy_url}")
        return TradovateClient(proxy_url=proxy_url, user_id=uid)
    else:
        logger.info(f"Creating direct client (no proxy): user={uid}, region={region}")
        return TradovateClient()
