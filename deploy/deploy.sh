#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# HedgeX Backend Deployment Script for Azure VM
# ═══════════════════════════════════════════════════════════════
#
# This script sets up the FastAPI backend on an Azure VM.
# Run as root or with sudo.
#
# Usage:
#   chmod +x deploy.sh
#   sudo ./deploy.sh
#
# Prerequisites:
#   - Ubuntu 22.04+ or Debian 12+
#   - Python 3.11+
#   - .env file configured with correct credentials
# ═══════════════════════════════════════════════════════════════

set -e

APP_DIR="/opt/hedgex-api"
SERVICE_NAME="hedgex-api"

echo "═══════════════════════════════════════════════"
echo "  HedgeX Backend Deployment"
echo "═══════════════════════════════════════════════"
echo ""

# ── Step 1: System Dependencies ─────────────────────────────
echo "📦 Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip libpq-dev nginx certbot python3-certbot-nginx > /dev/null 2>&1
echo "   ✅ System packages installed"

# ── Step 2: Create Application Directory ────────────────────
echo "📂 Setting up application directory..."
mkdir -p "$APP_DIR"

# Copy backend code (assumes we're running from the project root)
if [ -d "backend" ]; then
    echo "   Copying backend code..."
    cp -r backend/* "$APP_DIR/"
    cp deploy/.env.template "$APP_DIR/.env.template"
    echo "   ✅ Code copied to $APP_DIR"
else
    echo "   ⚠️  No 'backend' directory found. Make sure the code is in $APP_DIR"
fi

# ── Step 3: Python Virtual Environment ──────────────────────
echo "🐍 Setting up Python virtual environment..."
cd "$APP_DIR"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q
echo "   ✅ Dependencies installed"

# ── Step 4: Environment File ────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
    if [ -f "$APP_DIR/.env.template" ]; then
        cp "$APP_DIR/.env.template" "$APP_DIR/.env"
        echo "   ⚠️  Created .env from template — PLEASE EDIT with real credentials!"
        echo "   📝 Edit: nano $APP_DIR/.env"
    else
        echo "   ❌ No .env file found! Create one before starting the service."
    fi
else
    echo "   ✅ .env file exists"
fi

# ── Step 5: Systemd Service ─────────────────────────────────
echo "🔧 Installing systemd service..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << 'EOF'
[Unit]
Description=HedgeX Trading API - FastAPI Backend
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/hedgex-api
EnvironmentFile=/opt/hedgex-api/.env
ExecStart=/opt/hedgex-api/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=hedgex-api

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
echo "   ✅ Service installed and enabled"

# ── Step 6: Start the Service ───────────────────────────────
echo "🚀 Starting HedgeX backend..."
systemctl restart ${SERVICE_NAME}
sleep 3

if systemctl is-active --quiet ${SERVICE_NAME}; then
    echo "   ✅ Backend is running!"
    echo ""
    echo "   Test it: curl http://localhost:8000/"
    echo "   Logs:    journalctl -u ${SERVICE_NAME} -f"
else
    echo "   ❌ Failed to start! Check logs:"
    echo "   journalctl -u ${SERVICE_NAME} --no-pager -n 20"
fi

echo ""
echo "═══════════════════════════════════════════════"
echo "  Deployment Complete!"
echo "═══════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Edit /opt/hedgex-api/.env with real credentials"
echo "  2. Restart: systemctl restart ${SERVICE_NAME}"
echo "  3. Set up Nginx reverse proxy with HTTPS"
echo "  4. Open port 443 in Azure NSG"
echo ""
