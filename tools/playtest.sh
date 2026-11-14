#!/bin/sh
# usage: tools/playtest.sh [seed]   (needs the static server on 127.0.0.1:8792)
PATH=/home/agent/tools/node22/bin:$PATH LD_LIBRARY_PATH=/home/agent/tools/libroot/usr/lib/x86_64-linux-gnu node /home/agent/makefun/fps2/tools/playtest.mjs "${1:-3}"
