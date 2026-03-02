import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

from required_api.tradovate_client import TradovateClient
import requests

def test_api():
    client = TradovateClient()
    token, err = client.login("APEX_265995", "A3r3$f$$@CH1")
    if not token:
        print("Login failed:", err)
        return
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    
    print("\nTrying /contract/suggest for NQ")
    url = "https://demo.tradovateapi.com/v1/contract/suggest?t=NQ&l=10"
    resp = requests.get(url, headers=headers)
    print("Contract/suggest NQ:", resp.status_code)
    try:
        print(resp.json())
    except:
        print(resp.text)

    print("\nTrying /contract/suggest for ES")
    url = "https://demo.tradovateapi.com/v1/contract/suggest?t=ES&l=10"
    resp = requests.get(url, headers=headers)
    print("Contract/suggest ES:", resp.status_code)
    try:
        print(resp.json())
    except:
        print(resp.text)

if __name__ == "__main__":
    test_api()
