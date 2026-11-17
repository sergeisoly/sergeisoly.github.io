#!/bin/sh
# Prepare the standalone app for Quarto's project resources.
set -eu
cd "$(dirname "$0")/.."
revision=65327f5854f3e34cfaf181cf1c71c04822095df6
output=piramid-observatory
stamp=.quarto/observatory-revision
if [ -f "$output/index.html" ] && [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$revision" ]; then
  exit 0
fi

build_dir=$(mktemp -d)
trap 'rm -rf "$build_dir"' EXIT
git -C "$build_dir" init -q
git -C "$build_dir" fetch -q --depth=1 https://github.com/sergeisoly/piramid-observatory.git "$revision"
git -C "$build_dir" checkout -q --detach "$revision"
(cd "$build_dir" && npm ci --prefer-offline --no-audit --no-fund && npm run build)
mkdir -p "$output" .quarto
rsync -a --delete "$build_dir/dist/" "$output/"
printf '%s\n' "$revision" > "$stamp"
