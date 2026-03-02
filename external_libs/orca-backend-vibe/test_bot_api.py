"""
Test script to verify bot management API is working correctly.
Run this to confirm the backend is functioning before debugging frontend.

Usage:
    python test_bot_api.py
"""

import requests
import json
import time
from datetime import datetime

# Configuration
API_BASE_URL = "http://localhost:8000"
# Get your auth token from the frontend or login API
AUTH_TOKEN = "YOUR_TOKEN_HERE"  # Replace with actual token

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {AUTH_TOKEN}"
}


def print_section(title):
    """Print a formatted section header"""
    print("\n" + "="*60)
    print(f"  {title}")
    print("="*60)


def test_health_check():
    """Test the health check endpoint"""
    print_section("1. Testing Health Check")
    
    try:
        response = requests.get(f"{API_BASE_URL}/api/bots/health/check")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def test_get_all_bots():
    """Test getting all bots"""
    print_section("2. Testing Get All Bots")
    
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/bots/",
            headers=headers
        )
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"\nTotal Bots: {data['total']}")
            print(f"Active: {data['active']}")
            print(f"Paused: {data['paused']}")
            print(f"Stopped: {data['stopped']}")
            print(f"Error: {data['error']}")
            
            print(f"\nBots List:")
            for bot in data['bots']:
                print(f"  - {bot['custom_name'] or bot['bot_id']}")
                print(f"    Status: {bot['status']}")
                print(f"    Instrument: {bot['instrument']}")
                print(f"    P&L: ${bot['total_pnl']:.2f}")
                print(f"    Positions: {bot['open_positions']}")
                print()
            
            return data['bots']
        else:
            print(f"Response: {response.text}")
            return []
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return []


def test_get_bot_detail(bot_id):
    """Test getting bot details"""
    print_section(f"3. Testing Get Bot Detail: {bot_id}")
    
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/bots/{bot_id}",
            headers=headers
        )
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            bot = data['bot']
            print(f"\nBot Details:")
            print(f"  ID: {bot['bot_id']}")
            print(f"  Name: {bot['custom_name']}")
            print(f"  Status: {bot['status']}")
            print(f"  Instrument: {bot['instrument']}")
            print(f"  Account: {bot['account_name']}")
            print(f"  Started: {bot['start_time']}")
            print(f"  Total P&L: ${bot['total_pnl']:.2f}")
            print(f"  Open Positions: {bot['open_positions']}")
            print(f"  Won/Lost Orders: {bot['won_orders']}/{bot['lost_orders']}")
            
            print(f"\nRecent Actions ({len(data['recent_actions'])}):")
            for action in data['recent_actions'][:5]:
                print(f"  - {action['action_type']} by {action['performed_by']}")
                print(f"    at {action['timestamp']}")
                print(f"    success: {action['success']}")
            
            return True
        else:
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def test_start_bot():
    """Test starting a new bot"""
    print_section("4. Testing Start Bot")
    
    bot_config = {
        "accountName": "APEX",
        "accountsIds": ["ACC123"],
        "contract": "NQ",
        "way": "long",
        "exitStrategy": "standard",
        "pointPosition": "abc",
        "pointStrategy": "conservative",
        "environment": "PROD",
        "customName": "TestBot_API"
    }
    
    try:
        print("Starting bot with config:")
        print(json.dumps(bot_config, indent=2))
        
        response = requests.post(
            f"{API_BASE_URL}/api/v1/run-bot/max",
            headers=headers,
            json=bot_config
        )
        print(f"\nStatus Code: {response.status_code}")
        
        if response.status_code == 202:
            data = response.json()
            print(f"\n✅ Bot Started Successfully!")
            print(f"  Run ID: {data['run_id']}")
            print(f"  Bot ID: {data['bot_id']}")
            print(f"  Bot Name: {data['run_name']}")
            print(f"  Status: {data['status']}")
            
            return data['bot_id']
        else:
            print(f"Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return None


def test_pause_bot(bot_id):
    """Test pausing a bot"""
    print_section(f"5. Testing Pause Bot: {bot_id}")
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/bots/{bot_id}/pause",
            headers=headers,
            json={"performed_by": "test_script"}
        )
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ {data['message']}")
            print(f"  Success: {data['success']}")
            print(f"  New Status: {data.get('new_status')}")
            return True
        else:
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def test_resume_bot(bot_id):
    """Test resuming a bot"""
    print_section(f"6. Testing Resume Bot: {bot_id}")
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/bots/{bot_id}/resume",
            headers=headers,
            json={"performed_by": "test_script"}
        )
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ {data['message']}")
            print(f"  Success: {data['success']}")
            print(f"  New Status: {data.get('new_status')}")
            return True
        else:
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def test_stop_bot(bot_id):
    """Test stopping a bot"""
    print_section(f"7. Testing Stop Bot: {bot_id}")
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/bots/{bot_id}/stop",
            headers=headers,
            json={"performed_by": "test_script"}
        )
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ {data['message']}")
            print(f"  Success: {data['success']}")
            print(f"  New Status: {data.get('new_status')}")
            return True
        else:
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def main():
    """Run all tests"""
    print("\n" + "🚀 "*20)
    print("  Bot Management API Test Suite")
    print("🚀 "*20)
    
    # Check if auth token is set
    if AUTH_TOKEN == "YOUR_TOKEN_HERE":
        print("\n❌ ERROR: Please set your AUTH_TOKEN in the script first!")
        print("You can get it from:")
        print("  1. Browser DevTools → Application → Local Storage → auth_token")
        print("  2. Or login via the API and use the returned token")
        return
    
    # 1. Health check
    if not test_health_check():
        print("\n❌ Health check failed. Is the server running?")
        return
    
    # 2. Get all bots
    bots = test_get_all_bots()
    
    # 3. Get detail of first bot if any exist
    if bots:
        test_get_bot_detail(bots[0]['bot_id'])
    
    # Ask if user wants to test bot operations
    print("\n" + "-"*60)
    test_operations = input("\nDo you want to test bot operations (start/pause/resume/stop)? (y/n): ")
    
    if test_operations.lower() == 'y':
        # 4. Start a new bot
        bot_id = test_start_bot()
        
        if bot_id:
            # Wait a bit for bot to initialize
            print("\nWaiting 3 seconds for bot to initialize...")
            time.sleep(3)
            
            # 5. Check bot appears in list
            print_section("Verifying Bot in List")
            bots = test_get_all_bots()
            found = any(b['bot_id'] == bot_id for b in bots)
            if found:
                print(f"✅ Bot {bot_id} found in list!")
            else:
                print(f"❌ Bot {bot_id} NOT found in list!")
            
            # 6. Pause bot
            if test_pause_bot(bot_id):
                time.sleep(2)
                
                # 7. Resume bot
                if test_resume_bot(bot_id):
                    time.sleep(2)
                    
                    # 8. Stop bot
                    test_stop_bot(bot_id)
    
    print("\n" + "✅ "*20)
    print("  Test Suite Complete!")
    print("✅ "*20 + "\n")
    
    print("If all tests passed, the backend API is working correctly.")
    print("If you still don't see bots in the frontend:")
    print("  1. Check browser DevTools → Network tab")
    print("  2. Verify API calls are being made")
    print("  3. Check for CORS errors in console")
    print("  4. Verify auth token is being sent")
    print("  5. See FRONTEND_DEBUG_GUIDE.md for detailed debugging")


if __name__ == "__main__":
    main()
