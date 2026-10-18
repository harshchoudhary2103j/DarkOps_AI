#!/usr/bin/env bash
# ==============================================================================
# DarkOps AI — One-Click Automated Demo & Seeding Script (Bash)
# ==============================================================================
set -euo pipefail

API_URL="${OPERATIONAL_API_URL:-${1:-http://localhost:3000}}"

echo "============================================================"
echo " DarkOps AI — One-Click Environment Seeding & Demo Setup    "
echo " Target API: ${API_URL}"
echo "============================================================"

# 1. Check Health & Readiness
echo -e "\n[1/4] Checking Operational API Readiness at ${API_URL}/healthz..."
MAX_RETRIES=15
ATTEMPT=0
READY=false

while [ "$ATTEMPT" -lt "$MAX_RETRIES" ]; do
  ATTEMPT=$((ATTEMPT + 1))
  if curl -sf "${API_URL}/healthz" > /dev/null 2>&1; then
    READY=true
    echo "Operational API is healthy and reachable!"
    break
  fi
  echo "Attempt ${ATTEMPT}/${MAX_RETRIES}: Waiting for Operational API to respond..."
  sleep 2
done

if [ "$READY" = false ]; then
  echo "ERROR: Operational API at ${API_URL} failed to become healthy within the timeout window." >&2
  exit 1
fi

# 2. Seed 5-Store Manhattan World
echo -e "\n[2/4] Seeding 5-Store Manhattan Quick-Commerce World..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKER_DIR="${REPO_ROOT}/services/simulation-worker"
SCENARIO_PATH="${WORKER_DIR}/scenarios/default_manhattan.json"

if [ -f "$SCENARIO_PATH" ]; then
  export PYTHONPATH="${WORKER_DIR}"
  python -m src.seeder.cli run-all --scenario "${SCENARIO_PATH}" --api-url "${API_URL}"
  echo "Manhattan world topology and catalog seeded successfully!"
fi

# 3. Seed Realistic Orders
echo -e "\n[3/4] Generating realistic order traffic..."
ORDERS_SCRIPT="${SCRIPT_DIR}/seed_realistic_orders.js"
if [ -f "$ORDERS_SCRIPT" ]; then
  API_URL="${API_URL}" node "${ORDERS_SCRIPT}"
  echo "Customer orders seeded successfully!"
fi

# 4. Final Telemetry Check
echo -e "\n[4/4] Validating seeded entities..."
STORES_COUNT=$(curl -sf "${API_URL}/api/v1/stores" | grep -o '"id":' | wc -l || echo "0")
ORDERS_COUNT=$(curl -sf "${API_URL}/api/v1/orders" | grep -o '"id":' | wc -l || echo "0")

echo "Verification Summary:"
echo "  - Dark Stores: ${STORES_COUNT}"
echo "  - Orders:      ${ORDERS_COUNT}"
echo "============================================================"
echo " DarkOps AI Environment is fully seeded and ready for demo! "
echo "============================================================"
