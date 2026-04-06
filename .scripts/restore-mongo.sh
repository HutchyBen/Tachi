#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# restore-mongo.sh
# Runs mongorestore (via a throwaway Docker container) against MongoDB
# already running on localhost:27017. Nothing is installed to the system.
#
# Usage:
#   ./restore-mongo.sh <dump.gz> [target-db-name]
#
# Env overrides:
#   MONGO_VERSION  (default: 7)
#   MONGO_PORT     (default: 27017)
# ---------------------------------------------------------------------------

DUMP_FILE="${1:-dump.gz}"
MONGO_VERSION="${MONGO_VERSION:-7}"
MONGO_PORT="${MONGO_PORT:-27017}"
DB_NAME="${2:-}"

if ! command -v docker &>/dev/null; then
  echo "ERROR: docker is not in PATH." >&2
  exit 1
fi

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "ERROR: dump file not found: $DUMP_FILE" >&2
  echo "Usage: $0 <path/to/dump.gz> [db-name-override]" >&2
  exit 1
fi

DUMP_FILE="$(realpath "$DUMP_FILE")"
DUMP_DIR="$(dirname "$DUMP_FILE")"
DUMP_BASENAME="$(basename "$DUMP_FILE")"

RESTORE_ARGS=(--archive="/dump/${DUMP_BASENAME}" --gzip --verbose)
if [[ -n "$DB_NAME" ]]; then
  RESTORE_ARGS+=(--db "$DB_NAME")
fi

echo "Restoring $DUMP_BASENAME -> localhost:$MONGO_PORT ..."

docker run --rm \
  --network host \
  -v "${DUMP_DIR}:/dump:ro" \
  "mongo:$MONGO_VERSION" \
  mongorestore \
    --host "localhost:${MONGO_PORT}" \
    "${RESTORE_ARGS[@]}"

echo "Done."
