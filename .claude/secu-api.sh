#!/usr/bin/env bash
# secu-api.sh — authenticated wrapper for node-secu REST API.
# Claude uses this to call the API without being locked out.
#
# Usage:
#   ./secu-api.sh GET  /engagements
#   ./secu-api.sh POST /engagements '{"name":"test"}'
#   ./secu-api.sh GET  /rules
#   ./secu-api.sh POST /engagements/1/playbooks/web_recon_passive

set -euo pipefail

REPO="/home/niclas/Dokumente/developement/node-secu"
BASE="http://localhost:8108"

METHOD="${1:-GET}"
ENDPOINT="${2:-/engagements}"
BODY="${3:-}"

TOKEN=$(node "$REPO/scripts/operator-token.cjs" 2>/dev/null)
if [[ -z "$TOKEN" ]]; then
  echo "❌ Could not generate operator token" >&2
  exit 1
fi

ARGS=(-s -X "$METHOD" "$BASE$ENDPOINT" -H "Authorization: Bearer $TOKEN")
if [[ -n "$BODY" ]]; then
  ARGS+=(-H "Content-Type: application/json" -d "$BODY")
fi

curl "${ARGS[@]}" | python3 -m json.tool 2>/dev/null || curl "${ARGS[@]}"
