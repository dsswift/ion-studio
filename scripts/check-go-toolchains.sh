#!/usr/bin/env bash
# Enforce one Go toolchain patch across executable modules and build images.

set -euo pipefail

ROOT="${ION_TOOLCHAIN_CHECK_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

fail() {
  echo "go-toolchain check: $*" >&2
  exit 1
}

module_toolchain() {
  local file="$1"
  local version
  version="$(awk '/^toolchain go/ {sub(/^toolchain go/, ""); print; exit}' "$file")"
  [[ -n "$version" ]] || fail "$file has no toolchain directive"
  printf '%s\n' "$version"
}

docker_toolchain() {
  local file="$1"
  local version
  version="$(sed -nE 's/^FROM golang:([0-9]+\.[0-9]+\.[0-9]+)(-alpine)?([[:space:]]+AS[[:space:]].*)?$/\1/p' "$file" | head -1)"
  [[ -n "$version" ]] || fail "$file must pin an exact golang patch image"
  printf '%s\n' "$version"
}

RELAY_VERSION="$(module_toolchain "$ROOT/relay/go.mod")"
RELAY_DOCKER_VERSION="$(docker_toolchain "$ROOT/relay/Dockerfile")"
MAKE_VERSION="$({
  printf '%s\n' 'include Makefile' '.PHONY: print-go-version' 'print-go-version:'
  # shellcheck disable=SC2016 # Make expands GO_VERSION in generated recipe.
  printf '\t@printf '\''%%s\\n'\'' '\''$(GO_VERSION)'\''\n'
} | make -s --no-print-directory -C "$ROOT" -f - print-go-version)"

[[ "$RELAY_DOCKER_VERSION" == "$RELAY_VERSION" ]] || \
  fail "relay Docker builder $RELAY_DOCKER_VERSION differs from module $RELAY_VERSION"
[[ "$MAKE_VERSION" == "$RELAY_VERSION" ]] || \
  fail "Linux parity image $MAKE_VERSION differs from relay toolchain $RELAY_VERSION"

# A module that pins a toolchain pins the same one.
STUDIO_SDK_MOD="$ROOT/packages/studio-sdk/go/go.mod"
if [[ -f "$STUDIO_SDK_MOD" ]] && grep -q '^toolchain go' "$STUDIO_SDK_MOD"; then
  STUDIO_SDK_VERSION="$(module_toolchain "$STUDIO_SDK_MOD")"
  [[ "$STUDIO_SDK_VERSION" == "$RELAY_VERSION" ]] || \
    fail "studio-sdk toolchain $STUDIO_SDK_VERSION differs from relay $RELAY_VERSION"
fi

echo "go-toolchain check: OK ($RELAY_VERSION)"
