#!/usr/bin/env bash
# Run on the VPS as the dedicated deployment user after extracting a trusted
# release archive. This script does not install Caddy or modify its config.
set -Eeuo pipefail

source_dir="${1:?Usage: deploy-static.sh /path/to/extracted-dist /srv/northstar}"
site_root="${2:?Usage: deploy-static.sh /path/to/extracted-dist /srv/northstar}"

source_dir="$(cd "$source_dir" && pwd)"
site_root="${site_root%/}"
[[ -f "$source_dir/index.html" ]] || { echo "Error: source directory must contain index.html" >&2; exit 1; }
[[ "$site_root" != "/" && -n "$site_root" ]] || { echo "Error: refuse to use / as the site root" >&2; exit 1; }

umask 027
release_id="${RELEASE_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
releases_dir="$site_root/releases"
release_dir="$releases_dir/$release_id"
mkdir -p "$releases_dir"
[[ ! -e "$release_dir" ]] || { echo "Error: release already exists: $release_dir" >&2; exit 1; }

cp -a "$source_dir" "$release_dir"
find "$release_dir" -type d -exec chmod 0755 {} +
find "$release_dir" -type f -exec chmod 0644 {} +

if [[ -L "$site_root/current" ]]; then
  current_target="$(readlink -f "$site_root/current")"
  ln -s "$current_target" "$site_root/previous.new"
  mv -f "$site_root/previous.new" "$site_root/previous"
fi
ln -s "$release_dir" "$site_root/current.new"
mv -f "$site_root/current.new" "$site_root/current"

printf 'Deployed %s\nCurrent: %s\nPrevious: %s\n' "$release_id" "$site_root/current" "$site_root/previous"
