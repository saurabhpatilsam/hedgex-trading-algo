#!/usr/bin/env python3
"""
Test script for Account Balance API endpoints

Usage:
    python test_account_balance_api.py

This script tests all account balance endpoints to ensure they're working correctly.
"""

import json
import requests
from typing import Optional
import time
from datetime import datetime


# Configuration
BASE_URL = "http://localhost:8000"
API_PREFIX = "/api/accounts"

# Test data - Update these with your actual test accounts
TEST_USERNAME = "APEX_136189"  # Update with a valid username
TEST_ORCA_NAME = "PAAPEX1361890000010"  # Update with a valid orca_name
TEST_USERNAMES = ["APEX_136189", "APEX_136190"]  # Update with valid usernames

# Optional: Add your auth token if authentication is enabled
AUTH_TOKEN = None  # Set to your actual token or None if not using auth


class Colors:
    """Terminal colors for output"""
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'


def print_success(message: str):
    print(f"{Colors.GREEN}✅ {message}{Colors.ENDC}")


def print_error(message: str):
    print(f"{Colors.RED}❌ {message}{Colors.ENDC}")


def print_info(message: str):
    print(f"{Colors.BLUE}ℹ️  {message}{Colors.ENDC}")


def print_warning(message: str):
    print(f"{Colors.YELLOW}⚠️  {message}{Colors.ENDC}")


def get_headers() -> dict:
    """Get request headers with optional authentication"""
    headers = {"Content-Type": "application/json"}
    if AUTH_TOKEN:
        headers["Authorization"] = f"Bearer {AUTH_TOKEN}"
    return headers


def test_endpoint(method: str, endpoint: str, data: Optional[dict] = None, description: str = ""):
    """Test a single endpoint"""
    url = f"{BASE_URL}{API_PREFIX}{endpoint}"
    
    print(f"\n{Colors.BOLD}Testing: {description or endpoint}{Colors.ENDC}")
    print(f"  Method: {method}")
    print(f"  URL: {url}")
    
    if data:
        print(f"  Data: {json.dumps(data, indent=2)}")
    
    try:
        start_time = time.time()
        
        if method == "GET":
            response = requests.get(url, headers=get_headers())
        elif method == "POST":
            response = requests.post(url, json=data, headers=get_headers())
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        elapsed_time = (time.time() - start_time) * 1000  # Convert to ms
        
        print(f"  Status: {response.status_code}")
        print(f"  Time: {elapsed_time:.2f}ms")
        
        if response.status_code == 200:
            print_success(f"Endpoint working correctly")
            result = response.json()
            
            # Print summary based on endpoint type
            if "total_accounts" in result:
                print(f"  Summary:")
                print(f"    - Total accounts: {result.get('total_accounts', 0)}")
                print(f"    - Total cash value: ${result.get('total_cash_value', 0):,.2f}")
                print(f"    - Total realized P&L: ${result.get('total_realized_pnl', 0):,.2f}")
                print(f"    - Week P&L: ${result.get('total_week_realized_pnl', 0):,.2f}")
            elif "balance" in result:
                if result.get("balance"):
                    print(f"  Account: {result.get('orca_name')}")
                    print(f"    - Cash value: ${result['balance'].get('totalCashValue', 0):,.2f}")
                    print(f"    - Realized P&L: ${result['balance'].get('realizedPnL', 0):,.2f}")
                else:
                    print_warning(f"No balance data available for account")
            
            # Show sample of response
            print(f"\n  Response preview:")
            print(json.dumps(result, indent=2)[:500] + "..." if len(json.dumps(result)) > 500 else json.dumps(result, indent=2))
            
            return True, result
        else:
            print_error(f"Endpoint returned status {response.status_code}")
            print(f"  Error: {response.text}")
            return False, None
            
    except requests.exceptions.ConnectionError:
        print_error("Could not connect to server. Is it running?")
        return False, None
    except Exception as e:
        print_error(f"Error testing endpoint: {str(e)}")
        return False, None


def main():
    """Run all tests"""
    print(f"\n{Colors.BOLD}{'='*60}{Colors.ENDC}")
    print(f"{Colors.BOLD}Account Balance API Test Suite{Colors.ENDC}")
    print(f"{Colors.BOLD}{'='*60}{Colors.ENDC}")
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Base URL: {BASE_URL}")
    print(f"Auth: {'Enabled' if AUTH_TOKEN else 'Disabled'}")
    
    # Check if server is running
    print(f"\n{Colors.BOLD}Checking server connection...{Colors.ENDC}")
    try:
        response = requests.get(f"{BASE_URL}/")
        print_success(f"Server is running")
    except:
        print_error("Server is not running. Please start the server first.")
        print("Run: uvicorn app.orca_api:api_app --reload --host 0.0.0.0 --port 8000")
        return
    
    # Track test results
    results = []
    
    # Test 1: Get all account balances
    success, data = test_endpoint(
        "GET",
        f"/balance/{TEST_USERNAME}",
        description="Get all account balances for a username"
    )
    results.append(("Get all balances", success))
    
    # Test 2: Get single account balance
    if TEST_ORCA_NAME:
        success, data = test_endpoint(
            "GET",
            f"/balance/{TEST_USERNAME}/{TEST_ORCA_NAME}",
            description="Get balance for a specific account"
        )
        results.append(("Get single balance", success))
    else:
        print_warning("Skipping single account test - no TEST_ORCA_NAME provided")
    
    # Test 3: Get multiple users' balances
    if len(TEST_USERNAMES) > 0:
        success, data = test_endpoint(
            "POST",
            "/balance/multiple",
            data={"usernames": TEST_USERNAMES},
            description="Get balances for multiple usernames"
        )
        results.append(("Get multiple users", success))
    
    # Test 4: Get balance summary
    success, data = test_endpoint(
        "GET",
        f"/balance/summary/{TEST_USERNAME}?include_zero_balance=true",
        description="Get account balance summary"
    )
    results.append(("Get balance summary", success))
    
    # Test 5: Test with zero balance filter
    success, data = test_endpoint(
        "GET",
        f"/balance/summary/{TEST_USERNAME}?include_zero_balance=false",
        description="Get balance summary (excluding zero balances)"
    )
    results.append(("Get summary (no zero)", success))
    
    # Test 6: Test error handling with invalid username
    success, data = test_endpoint(
        "GET",
        "/balance/INVALID_USERNAME",
        description="Test error handling with invalid username"
    )
    results.append(("Error handling", not success))  # Expecting failure
    
    # Print summary
    print(f"\n{Colors.BOLD}{'='*60}{Colors.ENDC}")
    print(f"{Colors.BOLD}Test Results Summary{Colors.ENDC}")
    print(f"{Colors.BOLD}{'='*60}{Colors.ENDC}")
    
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for test_name, success in results:
        if success:
            print(f"{Colors.GREEN}✅ {test_name}{Colors.ENDC}")
        else:
            print(f"{Colors.RED}❌ {test_name}{Colors.ENDC}")
    
    print(f"\n{Colors.BOLD}Total: {passed}/{total} tests passed{Colors.ENDC}")
    
    if passed == total:
        print_success("All tests passed! API is working correctly.")
    else:
        print_warning(f"{total - passed} test(s) failed. Please check the errors above.")
    
    # Print API documentation location
    print(f"\n{Colors.BOLD}API Documentation:{Colors.ENDC}")
    print(f"  - Interactive docs: {BASE_URL}/docs")
    print(f"  - ReDoc: {BASE_URL}/redoc")
    print(f"  - Markdown docs: ./ACCOUNT_BALANCE_API_DOCS.md")


if __name__ == "__main__":
    main()
