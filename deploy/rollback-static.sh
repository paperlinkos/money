#!/usr/bin/env bash
# Restore the release retained by deploy-static.sh. No release directories are deleted.
set -Eeuo pipefail

site_root="${1:?Usage: rollback-static.sh /srv/northstar}"
site_root="${site_root%/}"
[[ -L "$site_root/current" && -L "$site_root/previous" ]] || { echo "Error: current and previous releases are both required" >&2; exit 1; }

current_target="$(readlink -f "$site_root/current")"
previous_target="$(readlink -f "$site_root/previous")"
ln -s "$current_target" "$site_root/previous.new"
ln -s "$previous_target" "$site_root/current.new"
mv -f "$site_root/previous.new" "$site_root/previous"
mv -f "$site_root/current.new" "$site_root/current"
printf 'Rolled back to %s\n' "$previous_target"
