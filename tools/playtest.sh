#!/bin/sh
# usage: [PORT=8792] tools/playtest.sh [seed]   (needs the static server on 127.0.0.1:PORT)
here=$(cd "$(dirname "$0")" && pwd)
PATH=/home/agent/tools/node22/bin:$PATH LD_LIBRARY_PATH=/home/agent/tools/libroot/usr/lib/x86_64-linux-gnu node "$here/playtest.mjs" "${1:-3}"
