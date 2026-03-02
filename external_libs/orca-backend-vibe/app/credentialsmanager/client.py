import json
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

import httpx
import redis
import requests
from loguru import logger

from publisher.client import get_redis_client


class AlertType(Enum):
    Pass = "Pass"
    Fail = "Fail"


# --- Constants ----------------------------------------------------------------

# Time-To-Live (TTL) for the tokens in seconds (1 hour)
TTL_SECONDS = 60 * 60
TLL_FIVE_MONTHS = TTL_SECONDS * TTL_SECONDS  # 150 days
MAX_WORKERS = 10

AUTH_URL = "https://tv-demo.tradovateapi.com/authorize?locale=en"
ACCOUNTS_URL = "https://tv-demo.tradovateapi.com/accounts?locale=en"
TRADINGVIEW_ORIGIN = "https://www.tradingview.com"
TRADER_TRADOVATE_ORIGIN = "https://trader.tradovate.com"

DISCORD_WEBHOOK_URL = (
    "https://discord.com/api/webhooks/"
    "1402811131613020312/"
    "sNRHWlMzQM3KQ3Z4522g07AFfOEdCS36i-SleW4NEKByVX0oxWSHxeHSSAXOMl8C_nx-"
)


# --- HTTP helpers -------------------------------------------------------------


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


def _build_auth_payload(username: str, password: str) -> str:
    encoded_username = urllib.parse.quote(username)
    encoded_password = urllib.parse.quote(password)
    return f"locale=en&login={encoded_username}&password={encoded_password}"


# --- Alerts -------------------------------------------------------------------


def discord_alert(type: AlertType, message: str) -> None:
    ribbon = 9498256 if type == AlertType.Pass else 16711680
    embed = {
        "title": "`Credentials Manager`",
        "description": message,
        "color": ribbon,
        "footer": {
            "text": "Alert: " + datetime.now().strftime("%Y-%m-%d %H:%M"),
        },
    }
    payload = {"embeds": [embed]}

    try:
        httpx.post(DISCORD_WEBHOOK_URL, json=payload, timeout=10)
    except httpx.HTTPError as exc:
        logger.error(f"Failed to send Discord alert: {exc}")


# --- Tradovate helpers --------------------------------------------------------


def get_access_token(username: str, password: str) -> Optional[str]:
    """
    Performs an API call to get an access token using the provided credentials.
    """
    payload = _build_auth_payload(username, password)
    headers = _build_tv_headers()

    try:
        response = requests.post(AUTH_URL, headers=headers, data=payload, timeout=15)
        response.raise_for_status()
        data = response.json()

        if data.get("s") == "ok":
            access_token = data.get("d", {}).get("access_token")
            if access_token:
                logger.debug(
                    f"Successfully obtained access token for user: {username}"
                )
                return access_token

            logger.error(
                f"Access token not found in the response for user: {username}"
            )
        else:
            logger.error(f"API call failed for user: {username}. Response: {data}")

    except requests.exceptions.RequestException as e:
        logger.error(f"Error during API call for user {username}: {e}")
        discord_alert(
            type=AlertType.Fail,
            message=f"Error fetching API token for tradovate account: {username}",
        )
    except json.JSONDecodeError:
        logger.error(
            f"Failed to parse JSON response for user: {username}. "
            f"Response text: {response.text if 'response' in locals() else ''}"
        )

    return None

# Region ACCOUNT DATA
def get_account_info(username: str, access_token: str):
    """
    Fetches account IDs and information for a given username and password.

    1. Authenticates with Tradovate to get an access token
    2. Uses the token to fetch account information
    """

    try:
        tradingview_accounts = get_tradingview_accounts_info(username=username, access_token=access_token)
        tradovate_accounts = get_tradovate_accounts_info(access_token=access_token)

        merged_account_info = merge_tradingview_tradovate_accounts(
            tradingview_accounts=tradingview_accounts,
            tradovate_accounts=tradovate_accounts,
            parent_account=username
        )

        return merged_account_info

    except Exception as e:
        raise  e
def get_tradingview_accounts_info(username: str, access_token: str) -> Optional[Dict[str, Any]]:
    """
    Fetches account IDs and information for a given username and password.

    1. Authenticates with Tradovate to get an access token
    2. Uses the token to fetch account information
    """
    headers = _build_tv_headers()

    try:
        account_info: Dict[str, Any] = {
            "username": username,
            "access_token": access_token,
        }

        # Step 2: Fetch account list
        accounts_headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Origin": TRADINGVIEW_ORIGIN,
            "Referer": f"{TRADINGVIEW_ORIGIN}/",
            "User-Agent": headers["User-Agent"],
            "sec-ch-ua": headers["sec-ch-ua"],
            "sec-ch-ua-mobile": headers["sec-ch-ua-mobile"],
            "sec-ch-ua-platform": headers["sec-ch-ua-platform"],
            "Sec-Fetch-Site": "cross-site",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
        }

        try:
            accounts_response = requests.get(
                ACCOUNTS_URL, headers=accounts_headers, timeout=15
            )
            accounts_response.raise_for_status()
            accounts_data = accounts_response.json()

            if accounts_data.get("s") == "ok":
                accounts = accounts_data.get("d", []) or []
                account_info["accounts"] = accounts

                account_ids: List[Dict[str, Any]] = []
                for account in accounts:
                    if isinstance(account, dict):
                        account_ids.append(
                            {
                                "id": account.get("id"),
                                "name": account.get("name"),
                                "currency": account.get("currency"),
                                "type": account.get("type"),
                                "currencySign": account.get("currencySign"),
                                'isVerified': account.get('isVerified'),
                            }
                        )

                account_info["account_ids"] = account_ids
            else:
                logger.error(f"Failed to get accounts: {accounts_data}")
                account_info["error"] = accounts_data.get("errmsg", "Unknown error")

        except requests.exceptions.RequestException as e:
            logger.error(f"Could not fetch account list: {e}")
            account_info["error"] = str(e)

        logger.info(f"Successfully fetched account info for user: {username}")
        return account_info

    except requests.exceptions.RequestException as e:
        logger.error(f"Error during API call for user {username}: {e}")
        return None
    except json.JSONDecodeError as e:
        logger.error(
            f"Failed to parse JSON response for user: {username}. Error: {e}"
        )
        return None
    except Exception as e:  # noqa: BLE001
        logger.error(f"Unexpected error fetching account info for {username}: {e}")
        return None
def get_tradovate_accounts_info(access_token: str):
    """
    Fetch account list from Tradovate demo API.

    :param access_token: Your Tradovate Bearer access token
    :return: Parsed JSON response (list of accounts)
    """

    url = "https://demo.tradovateapi.com/v1/account/list"

    headers = {
        "accept": "*/*",
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
        "authorization": f"Bearer {access_token}",
        "origin": TRADER_TRADOVATE_ORIGIN,
        "referer":TRADER_TRADOVATE_ORIGIN,
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    }

    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.json()

def merge_tradingview_tradovate_accounts(
    tradingview_accounts: List[Dict[str, Any]],
    tradovate_accounts: List[Dict[str, Any]],
    parent_account: str
) -> List[Dict[str, Any]]:
    """
    Merge TradingView and Tradovate account info into a unified structure.

    Join key: `name` (e.g. 'PAAPEX1361890000010') which is shared between both.
    """

    # Index Tradovate accounts by name for O(1) lookup
    tradovate_by_name = {acc["name"]: acc for acc in tradovate_accounts}

    merged = []

    for tv_acc in tradingview_accounts['account_ids']:

        name = tv_acc.get("name")
        t_acc = tradovate_by_name.get(name)
        if not t_acc:
            # No matching Tradovate account → skip or include partial if you prefer
            continue

        # Build a "useful" merged view
        merged.append({
            "parent_account" :parent_account,
            "orca_name": name,
            "tradingview_id": tv_acc.get("id"),
            "tradovate_id": t_acc.get("id"),
            "user_id": t_acc.get("userId"),

            # Basic info
            "account_type": t_acc.get("'accountType'"),
            "currency": tv_acc.get("currency"),
            "currency_sign": tv_acc.get("currencySign"),

            # TradingView flags
            "tv_type": tv_acc.get("type"),
            "tv_is_verified": tv_acc.get("isVerified"),

            # Tradovate status
            "active": t_acc.get("active"),
            "restricted": t_acc.get("restricted"),
            "closed": t_acc.get("closed"),
            "margin_account_type": t_acc.get("marginAccountType"),
            "legal_status": t_acc.get("legalStatus"),

            # Timestamps etc.
            "created_at": t_acc.get("timestamp"),
        })

    return merged

def get_account_ids_only(username: str, password: str) -> List[str]:
    """
    Simplified function that returns just the account IDs for a user.
    """
    account_info = get_account_info(username, password)
    if not account_info:
        return []

    return account_info.get("account_ids") or []
def fetch_store_accounts_info( username: str, access_token: str):
    """
    this info we need to get it only one time, the info are STATIC
    """
    redis_client = get_redis_client()
    accounts_data = get_account_info(username, access_token)
    redis_client.setex(f"tv_info:{username}", TLL_FIVE_MONTHS, json.dumps(accounts_data))
    return accounts_data

# endregion


# --- Redis helpers ------------------------------------------------------------


def update_redis_tokens(redis_client: redis.Redis, username: str, access_token: str):
    """
    Retrieves the list of keys from the username's list and updates
    each key's value with the new access token string, setting a TTL of 1 hour.
    """
    if not redis_client:
        logger.error("Redis client is not available. Cannot proceed with updates.")
        discord_alert(
            type=AlertType.Fail,
            message="Redis client is not available. Cannot proceed with updates",
        )
        return

    try:
        keys_to_update = redis_client.lrange(username, 0, -1)

        if not keys_to_update:
            logger.error(
                f"No keys found in Redis for user: {username}. "
                "Keys should already exist in the database."
            )
            discord_alert(
                type=AlertType.Fail,
                message=(
                    f"No keys found in Redis for user `{username}` - "
                    "Keys should already exist in the database"
                ),
            )
            return

        logger.debug(f"Found keys to update for {username}: {keys_to_update}")

        for key in keys_to_update:
            try:
                key_type = redis_client.type(key)  # Already a string, no decode needed

                if key_type in ("string", "none"):
                    redis_client.setex(f"tokens:{key}", TTL_SECONDS, access_token)
                    redis_client.setex(f"tokens:{username}", TTL_SECONDS, access_token)
                    logger.debug(
                        f"Successfully set/updated key '{key}' "
                        f"with token and TTL of {TTL_SECONDS}s."
                    )
                elif key_type == "hash":
                    redis_client.hset(key, "access_token", access_token)
                    redis_client.expire(key, TTL_SECONDS)
                    logger.debug(
                        f"Successfully updated hash key '{key}' "
                        f"with token and TTL of {TTL_SECONDS}s."
                    )
                else:
                    logger.warning(
                        f"Key '{key}' has an unsupported data type '{key_type}'. "
                        "Skipping update."
                    )
            except redis.exceptions.RedisError as e:
                logger.error(
                    f"Redis error while updating key '{key}' for user '{username}': {e}"
                )

    except redis.exceptions.RedisError as e:
        logger.error(f"Redis error while processing user key '{username}': {e}")
        discord_alert(
            type=AlertType.Fail,
            message=f"Redis error while processing user key `{username}`",
        )


def get_token_from_redis(redis_client: redis.Redis, key_name: str) -> Optional[str]:
    """
    Retrieves the string value (token) from Redis for a given key.
    This function assumes the key type and value will always be a string.
    """
    if not redis_client:
        logger.error("Redis client is not available. Cannot retrieve token.")
        return None

    try:
        value = redis_client.get(key_name)

        if value is not None:
            logger.debug(f"Successfully retrieved token for key '{key_name}'.")
            return value.decode()

        logger.debug(f"Key '{key_name}' does not exist or has no value.")
        return None

    except redis.exceptions.RedisError as e:
        logger.error(f"Redis error while retrieving token for key '{key_name}': {e}")
        return None


# --- Worker / orchestration ---------------------------------------------------


def process_account(creds: Dict[str, str], redis_client: redis.Redis) -> None:
    """Worker function to process a single account's token refresh."""
    username = creds.get("username")
    password = creds.get("password")

    if not username or not password:
        logger.warning(
            "Skipping a credentials entry due to missing username or password: %s",
            creds,
        )
        return

    access_token = get_access_token(username, password)
    if access_token:
        update_redis_tokens(redis_client, username, access_token)
    else:
        logger.error(
            f"Could not get access token for user {username}. "
            "Skipping Redis update for this user."
        )
        discord_alert(
            type=AlertType.Fail,
            message=(
                f"Could not get access token for `{username}` - "
                "Skipping Redis update for this user"
            ),
        )


def token_refresher(credentials_list: List[Dict[str, str]]) -> None:
    redis_client = get_redis_client()
    if not redis_client:
        logger.error("Redis client could not be created.")
        return

    num_accounts = len(credentials_list)
    logger.info(
        f"Starting token refresh for {num_accounts} accounts using {MAX_WORKERS} threads."
    )

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(process_account, creds, redis_client): creds
            for creds in credentials_list
        }

        for future in as_completed(futures):
            creds = futures[future]
            try:
                future.result()
            except Exception as exc:  # noqa: BLE001
                un = creds.get("username")
                logger.error(
                    f"An exception occurred while processing account {un}: {exc}"
                )


def main() -> None:
    """
    Main function to orchestrate the entire process using a thread pool.
    """
    try:
        with open("credentials.json", "r", encoding="utf-8") as f:
            credentials_list = json.load(f)
    except FileNotFoundError:
        logger.error("The file 'credentials.json' was not found.")
        return
    except json.JSONDecodeError:
        logger.error(
            "Error decoding JSON from 'credentials.json'. Please check the file format."
        )
        return

    if not isinstance(credentials_list, list):
        logger.error(
            "The 'credentials.json' file must contain a list of credential objects."
        )
        return


    token_refresher(credentials_list)

    for credentials in credentials_list:
        access_token = get_access_token(credentials["username"], password=credentials['password'])
        result = fetch_store_accounts_info(credentials["username"], access_token=access_token)
        print(result)

    # logger.debug("All token refresh tasks have been completed.")
    discord_alert(
        type=AlertType.Pass,
        message="All token refresh tasks have been completed",
    )


if __name__ == "__main__":
    main()
