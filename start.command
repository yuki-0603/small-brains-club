#!/usr/bin/env sh
set -eu
game_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3.9 or newer is required. Install it from https://www.python.org/"
  exit 1
fi
exec python3 "$game_dir/serve.py" "$@"
