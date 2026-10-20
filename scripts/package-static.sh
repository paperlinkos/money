#!/usr/bin/env bash
set -Eeuo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

npm run build:static
mkdir -p artifacts
release_id="${RELEASE_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
archive="artifacts/northstar-static-${release_id}.tar.gz"
tar -C apps/web/dist -czf "$archive" .
printf 'Created %s\n' "$archive"
