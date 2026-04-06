from database import SessionLocal
from models import BrokerCredential
from required_api.tradovate_client import TradovateClient
import logging
import sys

logging.basicConfig(level=logging.DEBUG, stream=sys.stdout)

db = SessionLocal()
cred = db.query(BrokerCredential).filter(BrokerCredential.is_active == True).first()
if not cred:
    print("No cred")
    sys.exit()

client = TradovateClient()
token, err = client.login(cred.login_id, cred.password)
if not token:
    print("Login failed:", err)
    sys.exit()

print("Logged in!")
try:
    quote = client.get_last_price("NQM6")
    print(quote)
except Exception as e:
    print("Error:", e)

