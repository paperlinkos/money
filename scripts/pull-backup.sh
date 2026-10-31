#!/bin/bash
# Copies the newest PaperlinkOS backup from the server to this computer.
# Usage: scripts/pull-backup.sh [destination folder]
set -euo pipefail
server=root@163.245.210.70
source_dir=/var/backups/paperlinkos
destination=${1:-$HOME/PaperlinkOS-backups}

mkdir -p "$destination"
chmod 700 "$destination"
dump=$(ssh "$server" "ls -1 $source_dir | grep '^db-' | sort | tail -1")
uploads=$(ssh "$server" "ls -1 $source_dir | grep '^uploads-' | sort | tail -1")
rsync -a "$server:$source_dir/$dump" "$destination/"
rsync -a --delete "$server:$source_dir/$uploads/" "$destination/uploads/"
pg_restore --list "$destination/$dump" >/dev/null 2>&1 && echo "Database copy checked." || echo "Could not check the database copy with pg_restore."
echo "Saved $dump and $uploads to $destination"
