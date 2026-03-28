"""
Azure VM Management Service for HedgeX.

Handles fully automated creation of Windows Server VMs,
NSG configuration, and Proxy Service injection via Azure RunCommand.
"""

import logging
import os
import time
from typing import Optional, Dict, Any

from azure.identity import ClientSecretCredential
from azure.mgmt.compute import ComputeManagementClient
from azure.mgmt.network import NetworkManagementClient
from azure.mgmt.network.models import SecurityRule, NetworkSecurityGroup

logger = logging.getLogger("azure-vm-manager")

AZURE_TENANT_ID = os.getenv("AZURE_TENANT_ID", "")
AZURE_CLIENT_ID = os.getenv("AZURE_CLIENT_ID", "")
AZURE_CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET", "")
AZURE_SUBSCRIPTION_ID = os.getenv("AZURE_SUBSCRIPTION_ID", "")
RESOURCE_GROUP = os.getenv("AZURE_RESOURCE_GROUP", "HX")
# Location lookup map
AZURE_LOCATIONS = {
    "india": "centralindia",
    "uk": "uksouth"
}
# Read setup_windows_proxy.ps1 script content
def _get_proxy_script() -> str:
    script_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "setup_windows_proxy.ps1")
    if os.path.exists(script_path):
        with open(script_path, "r") as f:
            return f.read()
    # Fallback script if file missing locally
    return """
$ErrorActionPreference = "SilentlyContinue"
if (-not (Get-Command "python" -ErrorAction SilentlyContinue)) {
    $installerPath = "$env:TEMP\\python-installer.exe"
    Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.11.8/python-3.11.8-amd64.exe" -OutFile $installerPath
    Start-Process -FilePath $installerPath -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1" -Wait
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}
$installDir = "C:\\HedgeX_Proxy"
if (-not (Test-Path $installDir)) { New-Item -ItemType Directory -Path $installDir | Out-Null }
Set-Location $installDir
$scriptUrl = "https://raw.githubusercontent.com/saurabhpatilsam/hedgex-trading-algo/main/backend/services/ip_proxy_service.py"
Invoke-WebRequest -Uri $scriptUrl -OutFile "C:\\HedgeX_Proxy\\ip_proxy_service.py"
python -m pip install --upgrade pip
python -m pip install fastapi uvicorn requests
if (-not (Get-NetFirewallRule -DisplayName "HedgeX Proxy Port 9000" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "HedgeX Proxy Port 9000" -Direction Inbound -LocalPort 9000 -Protocol TCP -Action Allow | Out-Null
}
$startupScript = "C:\\HedgeX_Proxy\\start_proxy.bat"
Set-Content -Path $startupScript -Value "@echo off`ncd C:\\HedgeX_Proxy`npython -m uvicorn ip_proxy_service:app --host 0.0.0.0 --port 9000"
Stop-Process -Name python -Force -ErrorAction SilentlyContinue
Start-Process -FilePath "C:\\HedgeX_Proxy\\start_proxy.bat" -WindowStyle Hidden
"""

def _get_credentials():
    return ClientSecretCredential(
        tenant_id=AZURE_TENANT_ID,
        client_id=AZURE_CLIENT_ID,
        client_secret=AZURE_CLIENT_SECRET,
    )

def _sanitize_name(name: str) -> str:
    return "hx-vm-" + name.lower().replace(" ", "-").replace("_", "-")

def provision_windows_proxy_vm(user_name: str, admin_username: str, admin_password: str, region: str = "india") -> Dict[str, Any]:
    """
    Fully automates the creation of a Windows VM and installs the proxy service.
    Takes ~3-5 minutes to complete on Azure.
    """
    logger.info(f"Starting automated VM provisioning for user: {user_name} in region: {region}")
    base_name = _sanitize_name(user_name)
    vnet_name = f"hx-vnet-{region}" # separate networking per region
    subnet_name = "default"
    
    location = AZURE_LOCATIONS.get(region, "centralindia")
    
    cred = _get_credentials()
    network_client = NetworkManagementClient(cred, AZURE_SUBSCRIPTION_ID)
    compute_client = ComputeManagementClient(cred, AZURE_SUBSCRIPTION_ID)

    # 1. Create Public IP
    logger.info(f"[{base_name}] Creating Public IP...")
    ip_poller = network_client.public_ip_addresses.begin_create_or_update(
        RESOURCE_GROUP,
        f"{base_name}-ip",
        {
            "location": location,
            "sku": {"name": "Standard"},
            "public_ip_allocation_method": "Static",
            "public_ip_address_version": "IPv4"
        }
    )
    ip_result = ip_poller.result()
    public_ip = ip_result.ip_address

    # 2. Create NSG with Port 22 and 9000
    logger.info(f"[{base_name}] Creating Network Security Group...")
    nsg_poller = network_client.network_security_groups.begin_create_or_update(
        RESOURCE_GROUP,
        f"{base_name}-nsg",
        {
            "location": location,
            "security_rules": [
                SecurityRule(
                    name="Allow-SSH", protocol="Tcp", source_port_range="*",
                    destination_port_range="22", source_address_prefix="*",
                    destination_address_prefix="*", access="Allow",
                    priority=1000, direction="Inbound"
                ),
                SecurityRule(
                    name="Allow-Proxy", protocol="Tcp", source_port_range="*",
                    destination_port_range="9000", source_address_prefix="*",
                    destination_address_prefix="*", access="Allow",
                    priority=1010, direction="Inbound"
                )
            ]
        }
    )
    nsg_result = nsg_poller.result()

    # 3. Get Subnet (Assuming VNet 'hx-vnet' and Subnet 'default' exist, fallback to creation if needed)
    try:
        subnet = network_client.subnets.get(RESOURCE_GROUP, vnet_name, subnet_name)
    except Exception:
        logger.warning("VNet hx-vnet not found. Creating a default VNet...")
        network_client.virtual_networks.begin_create_or_update(
            RESOURCE_GROUP, vnet_name,
            {"location": LOCATION, "address_space": {"address_prefixes": ["10.0.0.0/16"]}}
        ).result()
        subnet = network_client.subnets.begin_create_or_update(
            RESOURCE_GROUP, vnet_name, subnet_name,
            {"address_prefix": "10.0.0.0/24"}
        ).result()

    # 4. Create NIC
    logger.info(f"[{base_name}] Creating Network Interface...")
    nic_poller = network_client.network_interfaces.begin_create_or_update(
        RESOURCE_GROUP,
        f"{base_name}-nic",
        {
            "location": location,
            "ip_configurations": [{
                "name": "ipconfig1",
                "subnet": {"id": subnet.id},
                "public_ip_address": {"id": ip_result.id}
            }],
            "network_security_group": {"id": nsg_result.id}
        }
    )
    nic_result = nic_poller.result()

    # 5. Create Virtual Machine
    logger.info(f"[{base_name}] Creating Windows Server VM (Standard_B2s)...")
    vm_poller = compute_client.virtual_machines.begin_create_or_update(
        RESOURCE_GROUP,
        base_name,
        {
            "location": location,
            "os_profile": {
                "computer_name": base_name[:15],  # Windows limit is 15 chars
                "admin_username": admin_username,
                "admin_password": admin_password
            },
            "hardware_profile": {
                "vm_size": "Standard_B2s"
            },
            "storage_profile": {
                "image_reference": {
                    "publisher": "MicrosoftWindowsServer",
                    "offer": "WindowsServer",
                    "sku": "2022-datacenter-azure-edition",
                    "version": "latest"
                },
                "os_disk": {
                    "create_option": "FromImage",
                    "managed_disk": {"storage_account_type": "StandardSSD_LRS"}
                }
            },
            "network_profile": {
                "network_interfaces": [{"id": nic_result.id}]
            }
        }
    )
    vm_poller.wait()

    # 6. Run Custom Script Extension
    logger.info(f"[{base_name}] Injecting Proxy Service via Azure RunCommand...")
    script_content = _get_proxy_script()
    run_poller = compute_client.virtual_machines.begin_run_command(
        RESOURCE_GROUP,
        base_name,
        {
            "command_id": "RunPowerShellScript",
            "script": [script_content]
        }
    )
    run_poller.wait()
    logger.info(f"[{base_name}] ✅ VM Provisioning Complete! Proxy accessible at http://{public_ip}:9000")

    return {
        "vm_name": base_name,
        "public_ip": public_ip,
        "proxy_url": f"http://{public_ip}:9000",
        "admin_username": admin_username,
        "admin_password": admin_password
    }
