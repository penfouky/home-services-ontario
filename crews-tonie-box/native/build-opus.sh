#!/usr/bin/env bash
# Builds libtonieopus (libopus + tonie_opus.c) with zig, which cross-compiles for macOS from any OS.
#
#   native/build-opus.sh <opus source dir> <zig target> <output file>
#   e.g. native/build-opus.sh build/opus aarch64-macos.12.0 build/native/osx-arm64/libtonieopus.dylib
set -euo pipefail

src=$1 target=$2 out=$3
here=$(cd "$(dirname "$0")" && pwd)
zig=${ZIG:-zig}
obj=$(mktemp -d)
trap 'rm -rf "$obj"' EXIT

# source lists from libopus' own makefiles: float build, portable C
sources=$(cd "$src" && python3 - <<'PY'
import re
v = {}
for f in ('celt_sources.mk', 'silk_sources.mk', 'opus_sources.mk'):
    t = open(f).read().replace('\\\n', ' ')
    v.update({m.group(1): m.group(2).split() for m in re.finditer(r'^(\w+)\s*=\s*(.*)$', t, re.M)})
print(' '.join(v['CELT_SOURCES'] + v['SILK_SOURCES'] + v['SILK_SOURCES_FLOAT'] + v['OPUS_SOURCES'] + v['OPUS_SOURCES_FLOAT']))
PY
)

# the version opus_get_version_string() reports: from a release tarball or a git checkout
version=$(sed -n 's/^PACKAGE_VERSION="\(.*\)"$/\1/p' "$src/package_version" 2>/dev/null || true)
[ -n "$version" ] || version=$(git -C "$src" describe --tags 2>/dev/null | sed 's/^v//' || true)
[ -n "$version" ] || version=unknown

flags=(-target "$target" -O2 -fPIC -fvisibility=hidden -DOPUS_BUILD -DUSE_ALLOCA -DHAVE_LRINTF -DHAVE_LRINT
       "-DPACKAGE_VERSION=\"$version\""
       -I"$src/include" -I"$src/celt" -I"$src/silk" -I"$src/silk/float" -I"$src/src")
objs=() pids=()
max=8
for f in $sources "$here/tonie_opus.c"; do
    [[ $f == /* ]] || f=$src/$f
    o=$obj/$(echo "$f" | tr '/' '_').o
    $zig cc "${flags[@]}" -c "$f" -o "$o" &
    objs+=("$o") pids+=($!)
    # cap concurrency at `max`. bash's `wait -n` (wait for any job) needs 4.3+, but macOS ships
    # bash 3.2, so instead wait for the oldest job before launching the next, and drop it from
    # the list so it is never waited on twice (a second wait would return 127 and trip set -e).
    if [ "${#pids[@]}" -ge "$max" ]; then
        wait "${pids[0]}"
        pids=("${pids[@]:1}")
    fi
done
# wait for the stragglers; any failed compile stops the build (set -e)
for pid in "${pids[@]}"; do wait "$pid"; done

mkdir -p "$(dirname "$out")"
case $target in
    *macos*) $zig cc -target "$target" -shared -o "$out" "${objs[@]}" -Wl,-install_name,"@rpath/$(basename "$out")" ;;
    *)       $zig cc -target "$target" -shared -o "$out" "${objs[@]}" -lm ;;
esac
echo "built $out (libopus $version)"
