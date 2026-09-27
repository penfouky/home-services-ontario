#!/usr/bin/env bash
# Builds "teddy", the Toniebox audio file tool from
# https://github.com/toniebox-reverse-engineering/teddy, as a native, self-contained
# command-line binary. Default target is Apple Silicon (M1/M2/M3/M4) Macs.
#
#   ./build.sh              -> dist/teddy-1.7.0-macos-arm64.zip
#   ./build.sh osx-x64      -> Intel Mac build (any .NET runtime identifier works)
#
# Needs git, zip and the .NET 10 SDK (macOS: brew install --cask dotnet-sdk).
# Runs on macOS and Linux. The resulting binary needs nothing else installed.
set -euo pipefail

UPSTREAM=https://github.com/toniebox-reverse-engineering/teddy.git
TAG=v1.7.0
COMMIT=ca062fee5f8da450468e466b1a36e658deb56827
RID=${1:-osx-arm64}

here=$(cd "$(dirname "$0")" && pwd)
src=$here/build/teddy-src
out=$here/build/publish-$RID
name=teddy-${TAG#v}-${RID/#osx-/macos-}

for tool in git zip dotnet; do
    if ! command -v "$tool" >/dev/null; then
        echo "error: '$tool' is required (the .NET 10 SDK: https://dotnet.microsoft.com/download)" >&2
        exit 1
    fi
done
if [ "$(dotnet --version | cut -d. -f1)" -lt 10 ]; then
    echo "error: the .NET 10 SDK or newer is required, found $(dotnet --version)" >&2
    exit 1
fi

echo "==> Fetching teddy $TAG"
rm -rf "$src"
git -c advice.detachedHead=false clone -c core.autocrlf=false --quiet --depth 1 --branch "$TAG" "$UPSTREAM" "$src"
if [ "$(git -C "$src" rev-parse HEAD)" != "$COMMIT" ]; then
    echo "error: $TAG no longer points to $COMMIT" >&2
    exit 1
fi

echo "==> Applying the macOS patch"
git -C "$src" apply --whitespace=nowarn "$here/patches/teddy-$TAG-macos.patch"
# the version label comes from git: keep it "1.7.0-macos+ca062fe" instead of "...,dirty"
git -C "$src" diff --name-only -z | xargs -0 git -C "$src" update-index --assume-unchanged

echo "==> Building for $RID"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
rm -rf "$out"
dotnet publish "$src/Teddy/Teddy.csproj" -c Release -f net10.0 -r "$RID" --self-contained \
    -p:PublishSingleFile=true -p:GitBranch=macos -o "$out"

bin=$out/teddy
[ -f "$bin" ] || bin=$out/teddy.exe
# Apple Silicon only runs signed code, the SDK ad-hoc signs osx binaries (also when building on Linux)
if [ "$(uname -s)" = Darwin ] && [[ $RID == osx-* ]]; then
    codesign --verify --strict --verbose=1 "$bin"
fi

echo "==> Packaging"
rm -rf "$here/dist/$name" "$here/dist/$name.zip"
mkdir -p "$here/dist/$name"
cp "$bin" "$here/dist/$name/"
cp "$here/dist-readme.txt" "$here/dist/$name/README.txt"
(cd "$here/dist" && zip -qr -X "$name.zip" "$name")
rm -rf "$here/dist/$name"

echo "==> Done: $here/dist/$name.zip"
