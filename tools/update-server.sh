#!/usr/bin/env bash
# Update NB Academy on the server from the Git repository.
# Usage (on the server, inside the project folder):  tools/update-server.sh [service-name]
# Pulls the latest code, runs the tests against a throwaway data folder, and restarts the service.
# The live data folder (data/ or $NB_DATA_DIR) is never touched by the tests.
set -euo pipefail
SERVICE="${1:-nb-academy}"
cd "$(dirname "$0")/.."
echo "Fetching the latest code..."
git pull --ff-only
echo "Running tests..."
npm test
echo "Restarting $SERVICE..."
if command -v systemctl >/dev/null && systemctl list-unit-files | grep -q "^$SERVICE"; then sudo systemctl restart "$SERVICE"; systemctl --no-pager status "$SERVICE" | head -5
elif command -v pm2 >/dev/null; then pm2 restart "$SERVICE"
else echo "No systemd service or pm2 process named $SERVICE was found. Restart NB Academy the way it was started."; fi
echo "Done."
