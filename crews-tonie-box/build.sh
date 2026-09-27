#!/usr/bin/env bash
# Builds Crew's Tonie Box, a Mac app for listening to and making tonies, and the "teddy"
# command-line tool it is built on (https://github.com/toniebox-reverse-engineering/teddy).
# Everything is built from source.
#
#   ./build.sh               Apple Silicon Macs (M1 and newer)
#   ./build.sh osx-x64       Intel Macs
#   ./build.sh linux-x64     Linux: the app opens in the web browser (used by the tests)
#
# Results, in dist/:
#   Crews-Tonie-Box-<version>-macos-arm64.zip   the app, "Crew's Tonie Box.app"
#   teddy-1.7.0-crews-macos-arm64.zip           the command-line tool
#
# Needs git, curl, zip, python3, the .NET 10 SDK and zig (pip3 install ziglang, or brew install zig).
# On a Mac the app bundle is signed with codesign; on Linux with rcodesign when it is installed.
set -euo pipefail

TEDDY_REPO=https://github.com/toniebox-reverse-engineering/teddy.git
TEDDY_TAG=v1.7.0
TEDDY_COMMIT=ca062fee5f8da450468e466b1a36e658deb56827
OPUS_REPO=https://github.com/xiph/opus.git
OPUS_TAG=v1.6.1
OPUS_COMMIT=22244de5a79bd1d6d623c32e72bf1954b56235be
TONIES_JSON=https://raw.githubusercontent.com/toniebox-reverse-engineering/tonies-json/release/toniesV2.json
RID=${1:-osx-arm64}

here=$(cd "$(dirname "$0")" && pwd)
build=$here/build
dist=$here/dist
version=$(sed -n 's:.*<Version>\(.*\)</Version>.*:\1:p' "$here/app/CrewsTonieBox.csproj")

case $RID in
    osx-arm64)   zig_target=aarch64-macos.12.0     lib=libtonieopus.dylib label=macos-arm64 ;;
    osx-x64)     zig_target=x86_64-macos.12.0      lib=libtonieopus.dylib label=macos-intel ;;
    linux-x64)   zig_target=x86_64-linux-gnu.2.28  lib=libtonieopus.so    label=linux-x64 ;;
    linux-arm64) zig_target=aarch64-linux-gnu.2.28 lib=libtonieopus.so    label=linux-arm64 ;;
    *)
        echo "error: unknown target '$RID', use osx-arm64, osx-x64, linux-x64 or linux-arm64" >&2
        exit 1
        ;;
esac

for tool in git curl zip python3 dotnet; do
    if ! command -v "$tool" >/dev/null; then
        echo "error: '$tool' is required (the .NET 10 SDK: https://dotnet.microsoft.com/download)" >&2
        exit 1
    fi
done
if [ "$(dotnet --version | cut -d. -f1)" -lt 10 ]; then
    echo "error: the .NET 10 SDK or newer is required, found $(dotnet --version)" >&2
    exit 1
fi
if [ -z "${ZIG:-}" ]; then
    if command -v zig >/dev/null; then
        ZIG=zig
    elif python3 -c 'import ziglang' 2>/dev/null; then
        ZIG="python3 -m ziglang"
    else
        echo "error: zig is required to build libopus: pip3 install ziglang (or brew install zig)" >&2
        exit 1
    fi
fi
export ZIG DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1

# a pinned tag, checked against the commit it had when this script was written
fetch() {
    local repo=$1 tag=$2 commit=$3 dir=$4
    rm -rf "$dir"
    git -c advice.detachedHead=false clone -c core.autocrlf=false --quiet --depth 1 --branch "$tag" "$repo" "$dir"
    if [ "$(git -C "$dir" rev-parse HEAD)" != "$commit" ]; then
        echo "error: $repo $tag no longer points to $commit" >&2
        exit 1
    fi
}

sign_bundle() {
    local bundle=$1
    if [ "$(uname -s)" = Darwin ]; then
        codesign --force --sign - --timestamp=none "$bundle/Contents/MacOS/"*.dylib
        codesign --force --sign - --timestamp=none "$bundle"
        codesign --verify --deep --strict --verbose=1 "$bundle"
    elif command -v "${RCODESIGN:-rcodesign}" >/dev/null; then
        "${RCODESIGN:-rcodesign}" sign "$bundle"
    else
        echo "note: rcodesign is not installed, so the app bundle is not sealed (the programs in it are signed)" >&2
    fi
}

mkdir -p "$build"

echo "==> Fetching teddy $TEDDY_TAG and libopus $OPUS_TAG"
fetch "$TEDDY_REPO" "$TEDDY_TAG" "$TEDDY_COMMIT" "$build/teddy-src"
fetch "$OPUS_REPO" "$OPUS_TAG" "$OPUS_COMMIT" "$build/opus-src"

echo "==> Applying the changes to teddy"
git -C "$build/teddy-src" apply --whitespace=nowarn "$here/patches/teddy-$TEDDY_TAG.patch"
# the version label comes from git: keep it "1.7.0-crews+ca062fe" instead of "...,dirty"
git -C "$build/teddy-src" diff --name-only -z | xargs -0 git -C "$build/teddy-src" update-index --assume-unchanged

echo "==> Building libopus for $RID"
"$here/native/build-opus.sh" "$build/opus-src" "$zig_target" "$build/native/$RID/$lib"

echo "==> Fetching the list of tonies"
curl -fsSL --retry 3 "$TONIES_JSON" -o "$build/toniesV2.json"
python3 - "$build/toniesV2.json" <<'PY'
import json, sys
articles = json.load(open(sys.argv[1], encoding='utf-8'))
count = sum(len(a.get('data', [])) for a in articles)
if count < 1000:
    sys.exit(f'error: the tonies list has only {count} entries')
print(f'{count} tonies')
PY
mkdir -p "$here/app/Resources"
gzip -9 -n -c "$build/toniesV2.json" > "$here/app/Resources/toniesV2.json.gz"

out=$build/publish-$RID
rm -rf "$out"

echo "==> Building the app for $RID"
dotnet publish "$here/app/CrewsTonieBox.csproj" -c Release -r "$RID" --self-contained \
    -p:PublishSingleFile=true -p:DebugType=embedded -p:TeddySrc="$build/teddy-src" -p:NativeDir="$build/native" -o "$out/app"

echo "==> Building teddy for $RID"
dotnet publish "$build/teddy-src/Teddy/Teddy.csproj" -c Release -f net10.0 -r "$RID" --self-contained \
    -p:PublishSingleFile=true -p:DebugType=embedded -p:GitBranch=crews -o "$out/teddy"
cp "$build/native/$RID/$lib" "$out/teddy/"

echo "==> Packaging"
# every license of the software inside, with the texts that come with the sources
licenses=$build/Licenses.txt
{
    cat "$here/packaging/THIRD-PARTY-NOTICES.txt"
    printf '\n\nlibopus (its COPYING file)\n--------------------------\n\n'
    cat "$build/opus-src/COPYING"
    for font in "$here/app/wwwroot/fonts/"*-OFL.txt; do
        printf '\n\n%s font: SIL Open Font License 1.1\n------------------------------------\n\n' "$(basename "$font" -OFL.txt)"
        cat "$font"
    done
    dotnet_root=$(dirname "$(readlink -f "$(command -v dotnet)")")
    if [ -f "$dotnet_root/ThirdPartyNotices.txt" ]; then
        printf '\n\n.NET: its third-party notices\n-----------------------------\n\n'
        cat "$dotnet_root/ThirdPartyNotices.txt"
    fi
} > "$licenses"

mkdir -p "$dist"
app_zip=$dist/Crews-Tonie-Box-$version-$label.zip
cli_zip=$dist/teddy-${TEDDY_TAG#v}-crews-$label.zip
rm -rf "$app_zip" "$cli_zip" "$build/stage"
mkdir -p "$build/stage/app" "$build/stage/cli/teddy"

if [[ $RID == osx-* ]]; then
    bundle="$build/stage/app/Crew's Tonie Box.app"
    mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources"
    # programs in MacOS, everything else in Resources: codesign wants it that way
    for file in "$out/app"/*; do
        case $(basename "$file") in
            CrewsTonieBox | *.dylib) cp "$file" "$bundle/Contents/MacOS/" ;;
            icon.png) cp "$file" "$bundle/Contents/Resources/" ;;
            *) echo "error: unexpected file in the app build: $file" >&2; exit 1 ;;
        esac
    done
    cp "$here/app/Resources/AppIcon.icns" "$licenses" "$bundle/Contents/Resources/"
    sed "s/@VERSION@/$version/g" "$here/packaging/Info.plist" > "$bundle/Contents/Info.plist"
    printf 'APPL????' > "$bundle/Contents/PkgInfo"
    sign_bundle "$bundle"
    cp "$here/packaging/read-me-first.txt" "$build/stage/app/Read me first.txt"
else
    cp -R "$out/app" "$build/stage/app/crews-tonie-box"
fi
cp "$licenses" "$build/stage/app/"

(cd "$build/stage/app" && zip -qry -X "$app_zip" .)

cp "$out/teddy/teddy" "$out/teddy/$lib" "$build/stage/cli/teddy/"
cp "$here/cli-readme.txt" "$build/stage/cli/teddy/README.txt"
cp "$licenses" "$build/stage/cli/teddy/"
(cd "$build/stage/cli" && zip -qry -X "$cli_zip" teddy)

# when the build runs on this computer: a quick check that the programs start
case $(uname -s)-$(uname -m) in
    Darwin-arm64) here_rid=osx-arm64 ;;
    Darwin-x86_64) here_rid=osx-x64 ;;
    Linux-x86_64) here_rid=linux-x64 ;;
    Linux-aarch64) here_rid=linux-arm64 ;;
    *) here_rid=other ;;
esac
if [ "$RID" = "$here_rid" ]; then
    echo "==> Checking that it starts"
    if [[ $RID == osx-* ]]; then
        "$bundle/Contents/MacOS/CrewsTonieBox" --version
    else
        "$out/app/CrewsTonieBox" --version
    fi
    "$build/stage/cli/teddy/teddy" --help | grep "(build"
fi

echo "==> Done:"
ls -l "$app_zip" "$cli_zip"
