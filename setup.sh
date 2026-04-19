#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# setup.sh — Install dependencies for Coin Smith (PSBT transaction builder)
###############################################################################

cd "$(dirname "${BASH_SOURCE[0]}")"

npm install --production 2>&1

echo "Setup complete"
