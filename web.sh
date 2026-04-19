#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# web.sh — Coin Smith: PSBT builder web UI and visualizer
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export PORT="${PORT:-3000}"

exec node "$SCRIPT_DIR/src/server.js"
