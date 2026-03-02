import urllib.parse
from typing import Any, Dict, List, Optional

import requests
from loguru import logger

TRADINGVIEW_ORIGIN = "https://www.tradingview.com"
TRADER_TRADOVATE_ORIGIN = "https://trader.tradovate.com"

AUTH_URL = "https://tv-demo.tradovateapi.com/authorize?locale=en"
ACCOUNTS_URL = "https://demo.tradovateapi.com/v1/account/list"


def _build_tv_headers() -> Dict[str, str]:
    """Common headers used for Tradovate TV endpoints."""
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


def get_tradovate_token(username: str, password: str) -> Optional[str]:
    """
    Performs an API call to get an access token using the provided credentials
    via TradingView integration endpoint.
    """
    encoded_username = urllib.parse.quote(username)
    encoded_password = urllib.parse.quote(password)
    payload = f"locale=en&login={encoded_username}&password={encoded_password}"
    headers = _build_tv_headers()

    try:
        response = requests.post(AUTH_URL, headers=headers, data=payload, timeout=15)
        response.raise_for_status()
        data = response.json()

        if data.get("s") == "ok":
            access_token = data.get("d", {}).get("access_token")
            if access_token:
                logger.info(f"Successfully obtained access token for user: {username}")
                return access_token
            logger.error(f"Access token not found in the response for user: {username}")
        else:
            logger.error(f"API call failed for user: {username}. Response: {data}")

    except Exception as e:
        logger.error(f"Error fetching API token for tradovate account {username}: {e}")

    return None


def fetch_tradovate_accounts(access_token: str) -> List[Dict[str, Any]]:
    """
    Fetch account list from Tradovate demo API.
    """
    headers = {
        "accept": "*/*",
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
        "authorization": f"Bearer {access_token}",
        "origin": TRADER_TRADOVATE_ORIGIN,
        "referer": TRADER_TRADOVATE_ORIGIN,
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    }

    try:
        response = requests.get(ACCOUNTS_URL, headers=headers, timeout=15)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Error fetching tradovate accounts: {e}")
        return []
