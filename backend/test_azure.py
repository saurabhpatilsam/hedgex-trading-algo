from services.azure_ip_manager import create_static_ip
try:
    print(create_static_ip("TestUser", "india"))
except Exception as e:
    import traceback
    traceback.print_exc()
