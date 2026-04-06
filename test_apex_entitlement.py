import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from required_api.tradovate_client import TradovateClient

creds = [
    ("APEX_265995", "A3r3$f$$@CH1"),
    ("APEX_272045", "AFz222v#65Fe"),
    ("APEX_266668", "A3qF#R4s@7P@")
]

for login, pwd in creds:
    client = TradovateClient()
    print(f"\n--- Testing {login} ---")
    token, err = client.login(login, pwd)
    if token:
        print(f"SUCCESS: Token retrieved for {login}")
        # Try getting positions
        headers = client._get_headers()
        import requests
        url = "https://demo.tradovateapi.com/v1/account/list"
        resp = requests.get(url, headers=headers)
        if resp.status_code == 200:
            accounts = resp.json()
            if accounts:
                acc = accounts[0]
                acc_id = acc['id']
                print(f"Account ID: {acc_id}")
                
                # Fetch positions
                url_pos = "https://demo.tradovateapi.com/v1/position/list"
                pos_resp = requests.get(url_pos, headers=headers)
                print(f"Position Status: {pos_resp.status_code}")
                if pos_resp.status_code == 200:
                    print("Position Data:", pos_resp.json())
                else:
                    print(pos_resp.text)
            else:
                print("No accounts returned!")
        else:
            print(f"Account List Error: {resp.text}")
    else:
        print(f"FAILED: {err}")
