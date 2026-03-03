"""
Azure IP Management Service for HedgeX.

Handles automatic creation/deletion of static public IPs in Azure
when users are added or removed from the system.

Regions:
  - India: centralindia
  - UK: uksouth
"""

import logging
import os

from azure.identity import ClientSecretCredential
from azure.mgmt.network import NetworkManagementClient

logger = logging.getLogger("azure-ip-manager")

# Azure credentials — MUST be set as environment variables
AZURE_TENANT_ID = os.getenv("AZURE_TENANT_ID", "")
AZURE_CLIENT_ID = os.getenv("AZURE_CLIENT_ID", "")
AZURE_CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET", "")
AZURE_SUBSCRIPTION_ID = os.getenv("AZURE_SUBSCRIPTION_ID", "")
RESOURCE_GROUP = os.getenv("AZURE_RESOURCE_GROUP", "HX")

# Region mapping
REGION_MAP = {
    "india": "centralindia",
    "uk": "uksouth",
}

# VM names per region (for NIC attachment)
VM_NIC_MAP = {
    "centralindia": "hx-nic-india",
    "uksouth": "hx-nic-uk",
}


def _get_network_client():
    """Create an Azure Network Management client."""
    credential = ClientSecretCredential(
        tenant_id=AZURE_TENANT_ID,
        client_id=AZURE_CLIENT_ID,
        client_secret=AZURE_CLIENT_SECRET,
    )
    return NetworkManagementClient(credential, AZURE_SUBSCRIPTION_ID)


def _sanitize_name(name: str) -> str:
    """Convert user name to a valid Azure resource name."""
    return "hx-ip-" + name.lower().replace(" ", "-").replace("_", "-")


def create_static_ip(user_name: str, region: str) -> dict:
    """
    Create a new static public IP in Azure for a user.

    Args:
        user_name: The user's name (used to generate resource name)
        region: 'india' or 'uk'

    Returns:
        dict with 'ip_address', 'resource_name', 'azure_region', 'azure_location'
    """
    azure_location = REGION_MAP.get(region.lower())
    if not azure_location:
        raise ValueError(f"Unsupported region: {region}. Use 'india' or 'uk'.")

    resource_name = _sanitize_name(user_name)
    client = _get_network_client()

    logger.info(f"Creating static IP '{resource_name}' in {azure_location}...")

    # Create the public IP
    poller = client.public_ip_addresses.begin_create_or_update(
        resource_group_name=RESOURCE_GROUP,
        public_ip_address_name=resource_name,
        parameters={
            "location": azure_location,
            "sku": {"name": "Standard"},
            "public_ip_allocation_method": "Static",
            "public_ip_address_version": "IPv4",
            "tags": {
                "user": user_name,
                "managed-by": "hedgex",
                "region": region,
            },
        },
    )
    result = poller.result()
    ip_address = result.ip_address

    logger.info(f"✅ Created IP {ip_address} for {user_name} in {azure_location}")

    # Now attach to the NIC in that region
    nic_name = VM_NIC_MAP.get(azure_location)
    if nic_name:
        try:
            _attach_ip_to_nic(client, nic_name, resource_name, user_name, azure_location)
        except Exception as e:
            logger.warning(f"Could not auto-attach to NIC {nic_name}: {e}")

    return {
        "ip_address": ip_address,
        "resource_name": resource_name,
        "azure_region": region,
        "azure_location": azure_location,
    }


def _attach_ip_to_nic(client, nic_name: str, pip_name: str, user_name: str, location: str):
    """Attach a public IP to the NIC as a secondary IP configuration."""
    nic = client.network_interfaces.get(RESOURCE_GROUP, nic_name)

    # Get the subnet from the primary IP config
    subnet_id = nic.ip_configurations[0].subnet.id

    # Find next available private IP
    existing_private_ips = [
        cfg.private_ip_address for cfg in nic.ip_configurations
        if cfg.private_ip_address
    ]
    # Parse last octet and increment
    max_octet = max(int(ip.split(".")[-1]) for ip in existing_private_ips)
    base = ".".join(existing_private_ips[0].split(".")[:-1])
    new_private_ip = f"{base}.{max_octet + 1}"

    # Get the public IP resource
    pip = client.public_ip_addresses.get(RESOURCE_GROUP, pip_name)

    config_name = f"ipconfig-{user_name.lower().replace(' ', '-')}"

    nic.ip_configurations.append({
        "name": config_name,
        "subnet": {"id": subnet_id},
        "private_ip_address": new_private_ip,
        "private_ip_allocation_method": "Static",
        "public_ip_address": {"id": pip.id},
    })

    poller = client.network_interfaces.begin_create_or_update(
        RESOURCE_GROUP, nic_name, nic
    )
    poller.result()
    logger.info(f"✅ Attached {pip_name} to {nic_name} as {config_name} ({new_private_ip})")


def delete_static_ip(user_name: str) -> bool:
    """Delete a user's static public IP from Azure."""
    resource_name = _sanitize_name(user_name)
    client = _get_network_client()

    try:
        # First detach from NIC if attached
        _detach_ip_from_nics(client, resource_name)

        # Then delete the IP
        poller = client.public_ip_addresses.begin_delete(
            RESOURCE_GROUP, resource_name
        )
        poller.result()
        logger.info(f"✅ Deleted IP {resource_name}")
        return True
    except Exception as e:
        logger.error(f"Failed to delete IP {resource_name}: {e}")
        return False


def _detach_ip_from_nics(client, pip_name: str):
    """Remove a public IP from any NIC it's attached to."""
    try:
        pip = client.public_ip_addresses.get(RESOURCE_GROUP, pip_name)
        pip_id = pip.id
    except Exception:
        return  # IP doesn't exist

    for nic_name in VM_NIC_MAP.values():
        try:
            nic = client.network_interfaces.get(RESOURCE_GROUP, nic_name)
            original_len = len(nic.ip_configurations)

            # Remove any IP config that references this public IP
            nic.ip_configurations = [
                cfg for cfg in nic.ip_configurations
                if not (cfg.public_ip_address and cfg.public_ip_address.id == pip_id)
                or cfg.primary  # Never remove primary
            ]

            if len(nic.ip_configurations) < original_len:
                poller = client.network_interfaces.begin_create_or_update(
                    RESOURCE_GROUP, nic_name, nic
                )
                poller.result()
                logger.info(f"Detached {pip_name} from {nic_name}")
        except Exception as e:
            logger.debug(f"Skipping NIC {nic_name}: {e}")


def get_user_ip(user_name: str) -> str | None:
    """Get the current public IP for a user."""
    resource_name = _sanitize_name(user_name)
    client = _get_network_client()

    try:
        pip = client.public_ip_addresses.get(RESOURCE_GROUP, resource_name)
        return pip.ip_address
    except Exception:
        return None


def list_all_ips() -> list[dict]:
    """List all HedgeX-managed IPs in the resource group."""
    client = _get_network_client()
    ips = []

    try:
        for pip in client.public_ip_addresses.list(RESOURCE_GROUP):
            tags = pip.tags or {}
            if tags.get("managed-by") == "hedgex":
                ips.append({
                    "name": pip.name,
                    "ip_address": pip.ip_address,
                    "location": pip.location,
                    "user": tags.get("user", "unknown"),
                    "region": tags.get("region", "unknown"),
                    "provisioning_state": pip.provisioning_state,
                })
    except Exception as e:
        logger.error(f"Failed to list IPs: {e}")

    return ips
