#!/usr/bin/env bash
set -euo pipefail

REDIS_HOST="$1"
REDIS_PORT="$2"
REDIS_KEY_HEX="$3"
COMMIT="$4"

APP="/opt/hedgex-api"
WORK="/tmp/hedgex-deploy-${COMMIT}-${RANDOM}"
ARCHIVE="${WORK}/source.tgz"
SRCROOT="${WORK}/src"

mkdir -p "${WORK}" "${SRCROOT}" /opt/hedgex-api-backups
curl -fsSL -o "${ARCHIVE}" "https://github.com/saurabhpatilsam/hedgex-trading-algo/archive/${COMMIT}.tar.gz"
tar -xzf "${ARCHIVE}" -C "${SRCROOT}"

SRC="${SRCROOT}/hedgex-trading-algo-${COMMIT}/backend"
test -f "${SRC}/main.py"
test -f "${SRC}/requirements.txt"

BACKUP="/opt/hedgex-api-backups/hedgex-api-$(date +%Y%m%d%H%M%S)"
cp -a "${APP}" "${BACKUP}"

rsync -a --delete \
  --exclude ".env" \
  --exclude ".venv" \
  --exclude "hedging.db" \
  "${SRC}/" "${APP}/"

python3 - "$REDIS_HOST" "$REDIS_PORT" "$REDIS_KEY_HEX" <<'PY'
from pathlib import Path
import sys

redis_host, redis_port, redis_key_hex = sys.argv[1:4]
redis_key = bytes.fromhex(redis_key_hex).decode()
path = Path("/opt/hedgex-api/.env")
values = {
    "AZURE_REDIS_HOST": redis_host,
    "AZURE_REDIS_PORT": redis_port,
    "AZURE_REDIS_PASSWORD": redis_key,
    "REDIS_HOST": redis_host,
    "REDIS_PORT": redis_port,
    "REDIS_PASSWORD": redis_key,
}

lines = path.read_text().splitlines() if path.exists() else []
out = []
seen = set()
for line in lines:
    if "=" in line and not line.lstrip().startswith("#"):
        key = line.split("=", 1)[0].strip()
        if key in values:
            out.append(f"{key}={values[key]}")
            seen.add(key)
            continue
    out.append(line)

for key, value in values.items():
    if key not in seen:
        out.append(f"{key}={value}")

path.write_text("\n".join(out).rstrip() + "\n")
PY

cd "${APP}"
.venv/bin/pip install -r requirements.txt >/tmp/hedgex-pip-install.log

PYTHONPYCACHEPREFIX=/tmp/hedgex-pycache PYTHONPATH=. .venv/bin/python -m py_compile \
  main.py models.py schemas.py database.py required_api/tradovate_client.py \
  services/tv_bridge_service.py routers/broker_data.py routers/panel_orders.py \
  routers/accounts.py routers/users.py routers/instruments.py routers/strategy.py \
  routers/trading.py routers/market.py

systemctl restart hedgex-api.service
sleep 4
systemctl is-active hedgex-api.service

curl -fsS http://127.0.0.1:8000/ >/tmp/hedgex-root.json
curl -fsS http://127.0.0.1:8000/openapi.json >/tmp/hedgex-openapi.json

python3 - <<'PY'
import json
from pathlib import Path

schema = json.loads(Path("/tmp/hedgex-openapi.json").read_text())
text = Path("/tmp/hedgex-openapi.json").read_text()
print("ROUTE_COUNT", len(schema.get("paths", {})))
print("HAS_BROKER_CONFIG", "/api/broker/config" in schema.get("paths", {}))
print("HAS_TV_ACCOUNT_ID", "tv_account_id" in text)
print("HAS_STOP_LOSS", "stop_loss" in text)
PY
