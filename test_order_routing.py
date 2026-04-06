import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from required_api.tradovate_client import TradovateClient

login = "APEX_266668"
pwd = "A3qF#R4s@7P@"

client = TradovateClient()
print(f"\n--- Testing {login} ---")
token, err = client.login(login, pwd)
if token:
    print(f"SUCCESS: Token retrieved for {login}")
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    
    url = "https://demo.tradovateapi.com/v1/account/list"
    try:
        resp = client._proxied_request("GET", url, headers=headers)
        if resp.status_code == 200:
            accounts = resp.json()
            if accounts:
                acc = accounts[0]
                acc_id = acc['id']
                acc_spec = acc['name']
                print(f"Account ID: {acc_id}, Name: {acc_spec}")
                
                print("Placing Sample Limit Buy Order on MNQM6 at target lower price")
                try:
                    res = client.place_order(
                        account_id=acc_id,
                        account_spec=acc_spec,
                        symbol="MNQM6",
                        action="Buy",
                        qty=1,
                        order_type="Limit",
                        price=15000.0,
                    )
                    print("Order Response:", res)
                    print("TEST PASSED!")
                except Exception as e:
                    print("Exception in place_order:", e)
            else:
                print("No accounts returned!")
        else:
            print(f"Account List Error: {resp.text}")
    except Exception as e:
        print(f"Error making account/list request: {e}")
else:
    print(f"FAILED: {err}")
