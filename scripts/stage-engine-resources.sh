#!/usr/bin/env bash
# stage-engine-resources.sh -- build an engine into desktop/resources/engine/,
# where electron-builder picks it up.
#
# The engine lives in its own repository (dsswift/ion). This archive carries
# only the Studio-side engine files, so the engine is built from a checkout
# of that repository: ION_ENGINE_SOURCE names it and defaults to a sibling
# directory called `ion`. Check out the engine tag you want Studio to bundle
# before running this; the version string comes from that checkout.
#
# Every path that produces an Ion.app runs this first, so the app always
# carries the engine the operator chose, with the SDKs from the same tag.
#
# usage: ION_ENGINE_SOURCE=/path/to/ion scripts/stage-engine-resources.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE_SOURCE="${ION_ENGINE_SOURCE:-$REPO_ROOT/../ion}"
if [ ! -f "$ENGINE_SOURCE/engine/cmd/ion/main.go" ]; then
  echo "stage-engine-resources: no engine checkout at $ENGINE_SOURCE (set ION_ENGINE_SOURCE to a clone of dsswift/ion)" >&2
  exit 1
fi
ENGINE_SOURCE="$(cd "$ENGINE_SOURCE" && pwd)"
OUT="$REPO_ROOT/desktop/resources/engine/ion"
# ION_ENGINE_VERSION: a tree shipped without its git history is told the
# version the checkout it came from describes.
VERSION="${ION_ENGINE_VERSION:-$(git -C "$ENGINE_SOURCE/engine" describe --tags --always --dirty 2>/dev/null || echo dev)}"

mkdir -p "$(dirname "$OUT")"
echo "==> building engine $VERSION from $ENGINE_SOURCE into desktop/resources/engine/ion"
(cd "$ENGINE_SOURCE/engine" && go build -ldflags "-X main.version=${VERSION}" -o "$OUT" ./cmd/ion)
chmod +x "$OUT"

# Ad-hoc signature + no quarantine attributes, so the bundled engine runs on
# the machine that built it before electron-builder signs the whole app.
codesign --force --sign - --identifier house.sprague.ion.engine --options runtime \
  --entitlements "$REPO_ROOT/desktop/resources/entitlements.mac.plist" "$OUT" 2>/dev/null || true
xattr -cr "$OUT" 2>/dev/null || true

RES="$REPO_ROOT/desktop/resources/engine"
mkdir -p "$RES/extensions"
rm -rf "$RES/extensions/sdk" "$RES/extensions/sdk-go"
cp -R "$ENGINE_SOURCE/engine/extensions/sdk" "$RES/extensions/sdk"
rm -rf "$RES/extensions/sdk/node_modules" "$RES/extensions/sdk/__tests__"
cp -R "$ENGINE_SOURCE/sdk/go" "$RES/extensions/sdk-go"
cp "$REPO_ROOT/packaging/launchd/com.ion.engine.plist" "$RES/com.ion.engine.plist"

echo "==> staged: $("$OUT" version)"
