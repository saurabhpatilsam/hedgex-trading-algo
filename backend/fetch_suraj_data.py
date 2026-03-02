
import requests
import json
import time

BASE_URL = "http://localhost:8000"

users_to_add = [
    {"name": "Arjun", "broker": "Apex", "login": "APEX_272045", "pass": "AFz222v#65Fe"},
    {"name": "Suraj", "broker": "Apex", "login": "APEX_265995", "pass": "A3r3$f$$@CH1"},
    {"name": "Manish", "broker": "Apex", "login": "APEX_266668", "pass": "A3qF#R4s@7P@"}
]

def add_users():
    print("--- Adding Users & Credentials ---")
    for u in users_to_add:
        # Create user
        try:
            resp = requests.post(f"{BASE_URL}/api/users/", json={"name": u["name"]})
            if resp.status_code == 201:
                user = resp.json()
                print(f"Created user: {user['name']} (ID: {user['id']})")
                user_id = user['id']
            elif resp.status_code == 400:
                print(f"User {u['name']} already exists. Fetching ID...")
                # Fetch user
                users = requests.get(f"{BASE_URL}/api/users/").json()
                user = next((x for x in users if x["name"] == u["name"]), None)
                if user:
                    user_id = user['id']
                else:
                    print(f"Could not find existing user {u['name']}")
                    continue
            else:
                print(f"Failed to create user {u['name']}: {resp.text}")
                continue
            
            # Add credential
            cred_payload = {
                "broker": u["broker"],
                "login_id": u["login"],
                "password": u["pass"],
                "is_active": True
            }
            print(f"Adding credential for {u['name']}...")
            c_resp = requests.post(f"{BASE_URL}/api/users/{user_id}/credentials", json=cred_payload)
            if c_resp.status_code in [200, 201]:
                print(f"Credential added/updated for {u['name']}. Sub-accounts synced.")
            else:
                print(f"Failed to add credential for {u['name']}: {c_resp.text}")

        except Exception as e:
            print(f"Error processing {u['name']}: {e}")

def verify_suraj():
    print("\n--- Verifying Suraj's Data ---")
    try:
        users = requests.get(f"{BASE_URL}/api/users/").json()
        suraj = next((u for u in users if u["name"] == "Suraj"), None)
        
        if not suraj:
            print("Suraj user not found!")
            return

        print(f"User: {suraj['name']}")
        credentials = suraj.get("credentials", [])
        if not credentials:
            print("No credentials found for Suraj.")
            return

        for cred in credentials:
            print(f"Broker: {cred['broker']} ({cred['login_id']})")
            accounts = cred.get("accounts", [])
            print(f"Found {len(accounts)} sub-accounts:")
            for acc in accounts:
                print(f" - {acc['name']}: Balance = ${acc.get('balance', 'N/A')}")

    except Exception as e:
        print(f"Error verifying Suraj: {e}")

if __name__ == "__main__":
    # Wait for server to be ready?
    try:
        requests.get(f"{BASE_URL}/")
    except:
        print("Backend server not reachable. Please start uvicorn.")
        exit(1)
        
    add_users()
    verify_suraj()
