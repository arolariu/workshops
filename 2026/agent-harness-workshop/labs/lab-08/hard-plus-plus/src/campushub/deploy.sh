#!/usr/bin/env bash
# CampusHub deploy. The release runner runs it after a release approver signs off (README.md, Releasing).
# This copy of CampusHub is a lab: the script only prints what it would do. Nothing leaves your machine.
set -euo pipefail
cd "$(dirname "$0")"

mode="deploy"
if [ "${1:-}" = "--dry-run" ]; then mode="dry run"; fi
version="$(node -p "require('./package.json').version")"

echo "CampusHub ${version}: ${mode}"
echo "  1. npm test"
echo "  2. copy api/, web/ and jobs/ to campus-prod-1 and campus-prod-2"
echo "  3. restart campushub-api and reload the nightly-digest timer"
echo "  4. tag campushub-v${version} and post in #campushub-releases"
echo "Lab copy: nothing was deployed."
