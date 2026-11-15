#!/bin/sh
# usage: [PORT=8792] tools/shoot.sh "<query>" <absolute/out.jpg> [quality]   (needs the static server on PORT)
here=$(cd "$(dirname "$0")" && pwd)
cd /home/agent/makefun-tools && PATH=/home/agent/tools/node22/bin:$PATH LD_LIBRARY_PATH=/home/agent/tools/libroot/usr/lib/x86_64-linux-gnu NODE_PATH=/home/agent/makefun-tools/node_modules node "$here/shoot.mjs" "http://127.0.0.1:${PORT:-8792}/index.html$1" "$2" "${3:-80}"
