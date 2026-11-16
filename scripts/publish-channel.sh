#!/usr/bin/env bash
# Points a channel at a version: copies the catalog of release <tag> into the
# `channel/<channel>` release, the one Kunobi on that channel reads. The files
# the catalog names stay assets of <tag>, so promoting and rolling back only
# move this one file. Creates the channel release on first use.
#
#   scripts/publish-channel.sh v1.2.0 stable
#
# Needs `gh` with write access (GH_TOKEN) and GH_REPO, or a checkout to run in.
set -euo pipefail

tag="${1:?usage: publish-channel.sh <tag> <dev|unstable|stable>}"
channel="${2:?usage: publish-channel.sh <tag> <dev|unstable|stable>}"
case "$channel" in
  dev | unstable | stable) ;;
  *) echo "Unknown channel '$channel': expected dev, unstable or stable" >&2; exit 2 ;;
esac
if [[ ! "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "'$tag' is not a version tag (vX.Y.Z)" >&2
  exit 2
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
gh release download "$tag" --pattern catalog.json --dir "$work"
release="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).release)' "$work/catalog.json")"
if [[ "$release" != "$tag" ]]; then
  echo "The catalog of $tag names release '$release'" >&2
  exit 1
fi

target="channel/$channel"
if ! gh release view "$target" >/dev/null 2>&1; then
  # A pre-release, so GitHub never shows a channel as the latest version.
  gh release create "$target" --prerelease --title "Channel: $channel" \
    --notes "The catalog Kunobi's $channel channel reads. It points at a version release; run the Promote workflow to change it."
fi
gh release upload "$target" "$work/catalog.json" --clobber
gh release edit "$target" --notes "The catalog Kunobi's $channel channel reads. Now: $tag."
echo "$target now serves $tag"
