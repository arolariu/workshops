#!/bin/sh
# 🧠 Build Your Agent Harness: start the lab companion on macOS and Linux.
#   sh ./start.sh                      prepare what is missing (privately), then start the lab app
#   sh ./start.sh --check              only check: never downloads, installs, writes or starts anything
#   sh ./start.sh --offline            never use the network (uses Node.js 22+ or a verified cached download)
#   sh ./start.sh --full               also prepare the tools every lab needs
#   sh ./start.sh -- open lab-01 easy  everything after -- goes to the lab app as-is
# Nothing is installed globally: missing tools go to a private folder (.workshop/ next to this file, or
# WORKSHOP_TOOLS_DIR). Your PATH, shell profile and other installations are not changed. See SETUP.md.
set -u

# Reviewed pin: Node.js 24 LTS. Digests copied from https://nodejs.org/dist/v24.22.0/SHASUMS256.txt.
# Update NODE_VERSION and every digest together (setup-tools.mjs carries the same values; a test compares them).
NODE_VERSION=v24.22.0
NODE_SHA256_darwin_arm64=6a9724d9b50a5f22b4816cded441b5a8d9ddae546191a5e5b7efa5a5e2ee26d5
NODE_SHA256_darwin_x64=495e3f273c645f3c4677d438304cdfc701729ea5dec5728f5c8e76a2dece4b91
NODE_SHA256_linux_arm64=b7e7991d5407815adfa74a2a9cd4db683552c8ce32ff4a295c22e972849c3f5d
NODE_SHA256_linux_x64=28ea0a438de9a13bd7891fd758eee6c7819ee8af5442dfd8d45bd65e56d4228c
NODE_SHA256_linux_x64_musl=a95a0faf28d6f7c493036f0559d6d32b7b8c79aa06e415b12782f96946844484

say() { printf '  %s\n' "$*"; }
die() { printf '\n  %s\n\n' "$*" >&2; exit 3; }

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P) || die "Cannot find the workshop folder."
tools=${WORKSHOP_TOOLS_DIR:-"$here/.workshop"}
cache=${WORKSHOP_CACHE_DIR:-"$tools/cache"}
mirror=${WORKSHOP_NODE_MIRROR:-https://nodejs.org/dist}

check=0
offline=0
help=0
for a in "$@"; do
  case "$a" in
    --) break ;;
    --check) check=1 ;;
    --offline) offline=1 ;;
    -h | --help) help=1 ;;
  esac
done

usage() {
  cat <<EOF

  Build Your Agent Harness: workshop launcher (macOS and Linux)

  sh ./start.sh                     prepare what is missing, then start the lab app
  sh ./start.sh --check             only check what is installed; changes nothing
  sh ./start.sh --offline           never use the network
  sh ./start.sh --full              also prepare the tools of every lab (APM, GitHub CLI)
  sh ./start.sh --install=apm,gh    prepare these optional tools too
  sh ./start.sh -- open lab-01 easy everything after -- goes to the lab app

  Missing tools go to $tools
  (set WORKSHOP_TOOLS_DIR to use another folder). Nothing is installed globally,
  and your PATH and shell profile are not changed. Exit code 3 means a
  prerequisite could not be prepared. Details: SETUP.md

EOF
}

if [ "$help" = 1 ]; then usage; exit 0; fi

node_ok() { "$1" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1; }
version_lt() { awk -v a="$1" -v b="$2" 'BEGIN { n = split(a, x, "."); split(b, y, "."); for (i = 1; i <= 3; i++) { if ((x[i] + 0) < (y[i] + 0)) exit 0; if ((x[i] + 0) > (y[i] + 0)) exit 1 } exit 1 }'; }

# Which official Node.js build fits this machine? (WORKSHOP_PLATFORM overrides the detection, e.g. linux-x64.)
detect() {
  if [ -n "${WORKSHOP_PLATFORM:-}" ]; then plat=$WORKSHOP_PLATFORM; return 0; fi
  os=$(uname -s 2>/dev/null || echo unknown)
  arch=$(uname -m 2>/dev/null || echo unknown)
  case "$os" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) die "This launcher supports macOS and Linux (this is $os). On Windows use start.cmd; elsewhere install Node.js 22+ and run: node setup.mjs" ;;
  esac
  case "$arch" in
    x86_64 | amd64) arch=x64 ;;
    arm64 | aarch64) arch=arm64 ;;
    *) die "There is no official Node.js build for $os on $arch. Install Node.js 22+ yourself, then run this again." ;;
  esac
  plat="$os-$arch"
  if [ "$os" = linux ]; then
    if (ldd --version 2>&1 | grep -qi musl) || ls /lib/ld-musl-* >/dev/null 2>&1; then
      [ "$arch" = x64 ] || die "There is no official Node.js build for musl Linux on $arch. Install Node.js 22+ from your distribution (e.g. apk add nodejs), then run this again."
      plat=linux-x64-musl
    else
      glibc=$(getconf GNU_LIBC_VERSION 2>/dev/null | awk '{print $2}')
      if [ -n "$glibc" ] && version_lt "$glibc" 2.28; then
        die "Node.js $NODE_VERSION needs glibc 2.28 or newer (this system has $glibc). Install Node.js 22+ from your distribution, then run this again."
      fi
    fi
  else
    macos=$(sw_vers -productVersion 2>/dev/null || true)
    if [ -n "$macos" ] && version_lt "$macos" 13.5; then
      die "Node.js $NODE_VERSION needs macOS 13.5 or newer (this is $macos). Install Node.js 22+ that supports your macOS, then run this again."
    fi
  fi
}

sha_for() {
  key=$(printf '%s' "$1" | tr -c 'a-z0-9\n' '_')
  eval "printf '%s' \"\${NODE_SHA256_$key:-}\""
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then openssl dgst -sha256 "$1" | awk '{print $NF}'
  else return 1
  fi
}

fetch() {
  case "$1" in
    https://*) proto='=https' ;;
    http://127.0.0.1:* | http://localhost:*) proto='=http,https' ;;
    *) die "Refusing to download over an insecure connection: $1" ;;
  esac
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --proto "$proto" --proto-redir "$proto" --retry 2 --connect-timeout 20 --max-time 900 --max-filesize 314572800 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    if [ "$proto" = '=https' ]; then wget -q --https-only --timeout=30 --tries=2 -O "$2" "$1"; else wget -q --timeout=30 --tries=2 -O "$2" "$1"; fi
  else
    return 2
  fi
}

# Download (or reuse a verified cached copy of) the pinned official build and unpack it privately.
acquire() {
  sha=$(sha_for "$plat")
  [ -n "$sha" ] || die "There is no reviewed Node.js download for $plat. Install Node.js 22+ yourself, then run this again."
  name="node-$NODE_VERSION-$plat"
  file="$name.tar.gz"
  final="$tools/node/$name"
  command -v tar >/dev/null 2>&1 || die "tar is needed to unpack Node.js. Install tar, or install Node.js 22+ yourself."
  command -v gzip >/dev/null 2>&1 || die "gzip is needed to unpack Node.js. Install gzip, or install Node.js 22+ yourself."
  sha256 /dev/null >/dev/null 2>&1 || die "No SHA-256 tool (sha256sum, shasum or openssl) is available to verify the download. Install Node.js 22+ yourself."
  archive="$cache/$file"
  if [ -f "$archive" ] && [ "$(sha256 "$archive")" = "$sha" ]; then
    say "Using the cached $file (SHA-256 verified)."
  else
    if [ "$offline" = 1 ]; then
      die "Offline: Node.js 22+ was not found and no verified $file is cached. Put $file (from $mirror/$NODE_VERSION/) into $cache, or install Node.js 22+, then run this again."
    fi
    command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 || die "Neither curl nor wget is available to download Node.js. Install Node.js 22+ yourself, then run this again."
    mkdir -p "$cache" "$tools/node" || die "Cannot create $tools. Set WORKSHOP_TOOLS_DIR to a folder you can write to."
    part="$archive.$$.part"
    say "Downloading the official Node.js $NODE_VERSION for $plat ..."
    if ! fetch "$mirror/$NODE_VERSION/$file" "$part"; then
      rm -f "$part"
      die "The download failed: $mirror/$NODE_VERSION/$file. Check your connection or proxy (HTTPS_PROXY), or install Node.js 22+ yourself."
    fi
    got=$(sha256 "$part")
    if [ "$got" != "$sha" ]; then
      rm -f "$part"
      die "The download does not match its pinned SHA-256 checksum, so it was deleted and nothing was run (expected $sha, got $got)."
    fi
    mv -f "$part" "$archive" || die "Cannot save the download in $cache."
  fi
  mkdir -p "$tools/node" || die "Cannot create $tools. Set WORKSHOP_TOOLS_DIR to a folder you can write to."
  listing=$(tar -tzf "$archive" 2>/dev/null) || die "$archive is not a valid archive. Delete it and run this again."
  bad=$(printf '%s\n' "$listing" | awk -v p="$name/" 'index($0, p) != 1 || $0 ~ /(^|\/)\.\.(\/|$)/' | head -n 1)
  [ -z "$bad" ] || die "The archive contains an unexpected path ($bad), so it was not unpacked."
  stage="$tools/node/.staging-$$"
  rm -rf "$stage"
  mkdir "$stage" || die "Cannot write to $tools/node."
  if ! tar -xzf "$archive" -C "$stage"; then rm -rf "$stage"; die "Could not unpack $file."; fi
  if ! node_ok "$stage/$name/bin/node"; then rm -rf "$stage"; die "The unpacked Node.js does not run on this system. Install Node.js 22+ yourself."; fi
  if [ ! -d "$final" ]; then
    mv "$stage/$name" "$final" 2>/dev/null || [ -d "$final" ] || { rm -rf "$stage"; die "Could not finish preparing Node.js in $final."; }
  fi
  rm -rf "$stage"
  node="$final/bin/node"
  say "Node.js $NODE_VERSION is ready in $final"
}

node=
if [ -n "${WORKSHOP_NODE:-}" ]; then
  node_ok "$WORKSHOP_NODE" || die "WORKSHOP_NODE=$WORKSHOP_NODE is not Node.js 22 or newer."
  node=$WORKSHOP_NODE
elif command -v node >/dev/null 2>&1 && node_ok node; then
  node=$(command -v node)
else
  detect
  private="$tools/node/node-$NODE_VERSION-$plat/bin/node"
  if [ -x "$private" ] && node_ok "$private"; then node=$private; fi
fi

if [ -z "$node" ]; then
  if [ "$check" = 1 ]; then
    say "Node.js 22 or newer was not found."
    say "Without --check this launcher downloads the official Node.js $NODE_VERSION for $plat"
    say "(SHA-256 verified) into $tools/node. Or install Node.js 22+ from https://nodejs.org."
    exit 3
  fi
  acquire
fi

exec "$node" "$here/setup.mjs" "$@"
