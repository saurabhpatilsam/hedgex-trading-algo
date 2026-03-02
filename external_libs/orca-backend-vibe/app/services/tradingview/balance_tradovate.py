#!/usr/bin/env python3
"""
Utilities to get account balance information using the Tradovate API.

Main functions:

- get_all_account_balances(username)
    -> returns balances for all accounts under a parent username

- get_account_balance(username, orca_name)
    -> returns balance for a single account (matched by orca_name) under username
"""

import json
from typing import Any, Dict, List, Optional, Tuple

import requests

from app.services.orca_redis.sync_client import get_sync_redis_client

TRADOVATE_BASE_URL = "https://demo.tradovateapi.com/v1"


def get_tv_info(redis_client, username: str) -> List[Dict[str, Any]]:
    key = f"tv_info:{username}"
    raw = redis_client.get(key)
    if raw is None:
        return []

    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")

    return json.loads(raw)


def get_token(redis_client, username: str) -> str:
    """
    Get Tradovate API token from Redis for a given username.

    Expected Redis key: tokens:{username}
    """
    key = f"tokens:{username}"
    token = redis_client.get(key)
    if not token:
        raise ValueError(f'No token found for username "{username}"')

    if isinstance(token, bytes):
        token = token.decode("utf-8")

    return token


def _build_api_headers(redis_client, username: str) -> Dict[str, str]:
    """
    Internal helper to build Tradovate API headers.
    """
    api_access_token = get_token(redis_client, username)
    return {
        "Accept": "application/json",
        "Authorization": f"Bearer {api_access_token}",
    }


def _fetch_balance_for_account_id(
    api_headers: Dict[str, str],
    account_tov_id: Any,
) -> Tuple[Optional[Dict[str, float]], Optional[str]]:
    """
    Internal helper that calls Tradovate for a single accountId and returns:

        (balance_dict | None, error_str | None)

    balance_dict example:
        {
            "totalCashValue": float,
            "realizedPnL": float,
            "weekRealizedPnL": float,
        }
    """
    url = f"{TRADOVATE_BASE_URL}/cashBalance/getcashbalancesnapshot"
    payload = {"accountId": account_tov_id}

    try:
        response = requests.post(url, headers=api_headers, json=payload)
        response.raise_for_status()

        data = response.json() or {}

        balance = {
            "totalCashValue": float(data.get("totalCashValue", 0) or 0),
            "realizedPnL": float(data.get("realizedPnL", 0) or 0),
            "weekRealizedPnL": float(data.get("weekRealizedPnL", 0) or 0),
        }
        return balance, None

    except Exception as e:  # noqa: BLE001
        return None, str(e)


def get_all_account_balances(username: str) -> Dict[str, List[Dict[str, Any]]]:
    """
    Get account balance information for ALL accounts under a parent username.

    Args:
        username: parent username used for tv_info:{username} and tokens:{username}

    Returns:
        dict: {
            "accounts": [
                {
                    "parent_account": str | None,
                    "orca_name": str | None,
                    "tradovate_id": int | str | None,
                    "balance": {
                        "totalCashValue": float,
                        "realizedPnL": float,
                        "weekRealizedPnL": float,
                    } | None,
                    "error": str | None,
                },
                ...
            ]
        }
    """
    redis_client = get_sync_redis_client()
    accounts = get_tv_info(redis_client, username)
    api_headers = _build_api_headers(redis_client, username)

    results: Dict[str, List[Dict[str, Any]]] = {"accounts": []}

    for account in accounts:
        account_tov_id = account.get("tradovate_id")
        account_name = account.get("orca_name")
        parent_account = account.get("parent_account")

        account_result: Dict[str, Any] = {
            "parent_account": parent_account,
            "orca_name": account_name,
            "tradovate_id": account_tov_id,
            "balance": None,
            "error": None,
        }

        if account_tov_id is None:
            account_result["error"] = "Missing tradovate_id"
        else:
            balance, error = _fetch_balance_for_account_id(api_headers, account_tov_id)
            account_result["balance"] = balance
            account_result["error"] = error

        results["accounts"].append(account_result)

    return results


def get_account_balance(username: str, orca_name: str) -> Dict[str, Any]:
    """
    Get account balance information for a SINGLE account under a parent username.

    We:
      - load all accounts under `username`
      - find the one whose `orca_name` matches
      - call Tradovate for that account's tradovate_id

    Args:
        username: parent username
        orca_name: logical account name (orca_name) to match

    Returns:
        dict: {
            "parent_account": str | None,
            "orca_name": str | None,
            "tradovate_id": int | str | None,
            "balance": {
                "totalCashValue": float,
                "realizedPnL": float,
                "weekRealizedPnL": float,
            } | None,
            "error": str | None,
        }

    Raises:
        ValueError: if no account with that orca_name is found.
    """
    redis_client = get_sync_redis_client()
    accounts = get_tv_info(redis_client, username)

    # Find account by orca_name
    target_account = None
    for account in accounts:
        if account.get("orca_name") == orca_name:
            target_account = account
            break

    if target_account is None:
        raise ValueError(
            f'No account with orca_name "{orca_name}" found under username "{username}"'
        )

    api_headers = _build_api_headers(redis_client, username)

    account_tov_id = target_account.get("tradovate_id")
    account_tv_id = target_account.get("tradingview_id")
    parent_account = target_account.get("parent_account")

    result: Dict[str, Any] = {
        "parent_account": parent_account,
        "orca_name": orca_name,
        "tradovate_id": account_tov_id,
        "tradingView_id": account_tv_id,
        "balance": None,
        "error": None,
    }

    if account_tov_id is None:
        result["error"] = "Missing tradovate_id"
        return result

    balance, error = _fetch_balance_for_account_id(api_headers, account_tov_id)
    result["balance"] = balance
    result["error"] = error

    return result


if __name__ == "__main__":
    # Example usage (replace with real username)
    USERNAME = "APEX_136189"

    all_balances = get_all_account_balances(USERNAME)
    print(json.dumps(all_balances, indent=2))

    # Example single account
    try:
        single_balance = get_account_balance(USERNAME, "PAAPEX1361890000010")
        print(json.dumps(single_balance, indent=2))
    except ValueError as e:
        print(f"Error: {e}")
