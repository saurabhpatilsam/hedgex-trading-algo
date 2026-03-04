from database import SessionLocal
from models import User
from required_api.tradovate_client import get_proxied_client

db = SessionLocal()
suraj = db.query(User).filter(User.name.ilike("%suraj%")).first()
client = get_proxied_client(user=suraj)

headers = {"Authorization": f"Bearer {client.access_token}", "Accept": "application/json"}
print("Access token generated:", client.access_token is not None)

try:
    risk = client._proxied_request("GET", "https://demo.tradovateapi.com/v1/userAccountAutoLiq/list", headers=headers).json()
    print("Risk Params:", risk)
except Exception as e:
    print("Error:", e)
