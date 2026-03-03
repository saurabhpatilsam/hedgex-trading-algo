#!/usr/bin/env bash
#
# HedgeX Azure Infrastructure Setup
# Creates: 1 VM + 3 Static Public IPs + NIC with 3 IP configs
#
# Prerequisites:
#   - Azure CLI installed: brew install azure-cli
#   - Logged in: az login
#
# Usage:
#   chmod +x setup_azure_proxy.sh
#   ./setup_azure_proxy.sh
#

set -euo pipefail

# ── Configuration ───────────────────────────────────────────
RESOURCE_GROUP="hedgex-proxy-rg"
LOCATION="eastus"
VM_NAME="hedgex-proxy-vm"
VM_SIZE="Standard_B2s"                 # 2 vCPUs, 4 GB RAM, ~$15/mo
VM_IMAGE="Ubuntu2204"
ADMIN_USER="hedgex"
VNET_NAME="hedgex-vnet"
SUBNET_NAME="hedgex-subnet"
NSG_NAME="hedgex-nsg"
NIC_NAME="hedgex-nic"

# Public IP names (one per user)
PIP_1="hedgex-ip-user1-arjun"
PIP_2="hedgex-ip-user2-suraj"
PIP_3="hedgex-ip-user3-manish"

echo "═══════════════════════════════════════════════════════"
echo "  HedgeX Azure Proxy Infrastructure Setup"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── Step 1: Resource Group ──────────────────────────────────
echo "📦 Step 1: Creating Resource Group..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output table
echo ""

# ── Step 2: Virtual Network ────────────────────────────────
echo "🌐 Step 2: Creating Virtual Network..."
az network vnet create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VNET_NAME" \
  --address-prefix "10.0.0.0/16" \
  --subnet-name "$SUBNET_NAME" \
  --subnet-prefix "10.0.0.0/24" \
  --output table
echo ""

# ── Step 3: Network Security Group ─────────────────────────
echo "🔒 Step 3: Creating Network Security Group..."
az network nsg create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$NSG_NAME" \
  --output table

# Allow SSH
az network nsg rule create \
  --resource-group "$RESOURCE_GROUP" \
  --nsg-name "$NSG_NAME" \
  --name "AllowSSH" \
  --priority 100 \
  --direction Inbound \
  --access Allow \
  --protocol Tcp \
  --source-address-prefixes "*" \
  --source-port-ranges "*" \
  --destination-port-ranges 22 \
  --output table

# Allow proxy service (port 9000)
az network nsg rule create \
  --resource-group "$RESOURCE_GROUP" \
  --nsg-name "$NSG_NAME" \
  --name "AllowProxy" \
  --priority 110 \
  --direction Inbound \
  --access Allow \
  --protocol Tcp \
  --source-address-prefixes "*" \
  --source-port-ranges "*" \
  --destination-port-ranges 9000 \
  --output table
echo ""

# ── Step 4: Static Public IPs ──────────────────────────────
echo "📌 Step 4: Creating 3 Static Public IPs..."
for PIP in "$PIP_1" "$PIP_2" "$PIP_3"; do
  az network public-ip create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$PIP" \
    --sku Standard \
    --allocation-method Static \
    --version IPv4 \
    --output table
done

# Retrieve IPs
IP1=$(az network public-ip show --resource-group "$RESOURCE_GROUP" --name "$PIP_1" --query 'ipAddress' -o tsv)
IP2=$(az network public-ip show --resource-group "$RESOURCE_GROUP" --name "$PIP_2" --query 'ipAddress' -o tsv)
IP3=$(az network public-ip show --resource-group "$RESOURCE_GROUP" --name "$PIP_3" --query 'ipAddress' -o tsv)

echo ""
echo "  Arjun  (User 1): $IP1"
echo "  Suraj  (User 2): $IP2"
echo "  Manish (User 3): $IP3"
echo ""

# ── Step 5: NIC with 3 IP Configurations ───────────────────
echo "🔧 Step 5: Creating NIC with 3 IP configurations..."

# Primary IP config (user 1 - Arjun)
az network nic create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$NIC_NAME" \
  --vnet-name "$VNET_NAME" \
  --subnet "$SUBNET_NAME" \
  --network-security-group "$NSG_NAME" \
  --public-ip-address "$PIP_1" \
  --private-ip-address "10.0.0.5" \
  --ip-forwarding true \
  --output table

# Secondary IP config (user 2 - Suraj)
az network nic ip-config create \
  --resource-group "$RESOURCE_GROUP" \
  --nic-name "$NIC_NAME" \
  --name "ipconfig-user2" \
  --public-ip-address "$PIP_2" \
  --private-ip-address "10.0.0.6" \
  --output table

# Tertiary IP config (user 3 - Manish)
az network nic ip-config create \
  --resource-group "$RESOURCE_GROUP" \
  --nic-name "$NIC_NAME" \
  --name "ipconfig-user3" \
  --public-ip-address "$PIP_3" \
  --private-ip-address "10.0.0.7" \
  --output table
echo ""

# ── Step 6: Create VM ──────────────────────────────────────
echo "🖥️  Step 6: Creating VM ($VM_SIZE)..."
az vm create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --nics "$NIC_NAME" \
  --image "$VM_IMAGE" \
  --size "$VM_SIZE" \
  --admin-username "$ADMIN_USER" \
  --generate-ssh-keys \
  --output table
echo ""

# ── Step 7: Configure secondary IPs inside VM ─────────────
echo "⚙️  Step 7: Configuring secondary IPs inside VM..."

# Create a script to run inside the VM
SETUP_SCRIPT=$(cat <<'INNEREOF'
#!/bin/bash
set -e

# Add secondary IP addresses to the network interface
# These IPs must match the Azure NIC IP configs

# Get the primary interface name
IFACE=$(ip route | grep default | awk '{print $5}' | head -1)

# Add secondary IPs
sudo ip addr add 10.0.0.6/24 dev $IFACE 2>/dev/null || true
sudo ip addr add 10.0.0.7/24 dev $IFACE 2>/dev/null || true

# Make persistent (netplan)
cat <<NETPLAN | sudo tee /etc/netplan/99-hedgex-ips.yaml
network:
  version: 2
  ethernets:
    $IFACE:
      addresses:
        - 10.0.0.6/24
        - 10.0.0.7/24
NETPLAN
sudo netplan apply 2>/dev/null || true

# Policy routing: ensure each source IP goes out through the correct route
# Route table for user2 (10.0.0.6)
echo "200 user2" | sudo tee -a /etc/iproute2/rt_tables 2>/dev/null || true
sudo ip rule add from 10.0.0.6 table user2 2>/dev/null || true
sudo ip route add default via 10.0.0.1 dev $IFACE table user2 2>/dev/null || true

# Route table for user3 (10.0.0.7)
echo "201 user3" | sudo tee -a /etc/iproute2/rt_tables 2>/dev/null || true
sudo ip rule add from 10.0.0.7 table user3 2>/dev/null || true
sudo ip route add default via 10.0.0.1 dev $IFACE table user3 2>/dev/null || true

# Install Python + dependencies
sudo apt-get update -qq
sudo apt-get install -y -qq python3-pip python3-venv

# Create app directory
sudo mkdir -p /opt/hedgex-proxy
cd /opt/hedgex-proxy

# Create venv
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn requests

# Create systemd service
cat <<SERVICE | sudo tee /etc/systemd/system/hedgex-proxy.service
[Unit]
Description=HedgeX IP Proxy Service
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/hedgex-proxy
Environment="USER_IP_1=10.0.0.5"
Environment="USER_IP_2=10.0.0.6"
Environment="USER_IP_3=10.0.0.7"
ExecStart=/opt/hedgex-proxy/venv/bin/uvicorn ip_proxy_service:app --host 0.0.0.0 --port 9000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
echo "✅ VM setup complete! Upload ip_proxy_service.py to /opt/hedgex-proxy/ and run: sudo systemctl start hedgex-proxy"
INNEREOF
)

az vm run-command invoke \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --command-id RunShellScript \
  --scripts "$SETUP_SCRIPT" \
  --output table 2>/dev/null || echo "⚠️  VM setup script may need to be run manually via SSH"
echo ""

# ── Summary ────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ SETUP COMPLETE"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Resource Group:  $RESOURCE_GROUP"
echo "  VM:              $VM_NAME ($VM_SIZE)"
echo "  Region:          $LOCATION"
echo ""
echo "  User IPs:"
echo "    Arjun  (1): $IP1  (private: 10.0.0.5)"
echo "    Suraj  (2): $IP2  (private: 10.0.0.6)"
echo "    Manish (3): $IP3  (private: 10.0.0.7)"
echo ""
echo "  Proxy Service:   http://$IP1:9000"
echo ""
echo "  Next steps:"
echo "    1. SSH into VM:  ssh $ADMIN_USER@$IP1"
echo "    2. Upload proxy: scp backend/services/ip_proxy_service.py $ADMIN_USER@$IP1:/opt/hedgex-proxy/"
echo "    3. Start proxy:  sudo systemctl enable --now hedgex-proxy"
echo "    4. Test:         curl http://$IP1:9000/"
echo "    5. Verify IPs:   curl http://$IP1:9000/whoami/1"
echo "                     curl http://$IP1:9000/whoami/2"
echo "                     curl http://$IP1:9000/whoami/3"
echo ""
echo "  Update HedgeX backend PROXY_URL env var to: http://$IP1:9000"
echo "═══════════════════════════════════════════════════════"
