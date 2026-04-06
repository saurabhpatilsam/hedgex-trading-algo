import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from required_api.tradovate_client import TradovateClient

login = "APEX_266668"
pwd = "A3qF#R4s@7P@"

client = TradovateClient()
token, err = client.login(login, pwd)
if token:
    print(f"Cancelling order 161878843950...")
    try:
        res = client.cancel_order(161878843950)
        print("Cancel Response:", res)
    except Exception as e:
        print("Exception:", e)
else:
    print(f"FAILED: {err}")
