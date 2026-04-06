import sqlite3
import requests

def test_login():
    conn = sqlite3.connect("backend/hedging.db")
    c = conn.cursor()
    c.execute("SELECT login_id, password FROM broker_credentials WHERE login_id='APEX_272045'")
    row = c.fetchone()
    conn.close()
    
    if not row:
        print("No creds found.")
        return
        
    username, password = row
    
    url = "https://demo.tradovateapi.com/v1/auth/accesstokenrequest"
    # Wait, accesstokenrequest requires app credentials if not from browser!
    # But from browser it requires device ID (cid=8), appVersion, sec.
    payload = {
        "name": username,
        "password": password,
        "appId": "Trader",
        "appVersion": "250225.1",
        "cid": 851, 
        "sec": "f339cf0f-7b..."
    }
    
    # We can also just try another URL that was there
    print(f"Testing {url}...")
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
        "Content-Type": "application/json"
    }
    
    resp = requests.post(url, json=payload, headers=headers)
    print(resp.status_code)
    print(resp.text)

if __name__ == "__main__":
    test_login()
