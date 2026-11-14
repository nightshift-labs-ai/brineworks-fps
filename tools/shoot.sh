#!/bin/sh
# usage: tools/shoot.sh "<query>" <out.jpg> [quality]
cd /home/agent/makefun-tools && PATH=/home/agent/tools/node22/bin:$PATH LD_LIBRARY_PATH=/home/agent/tools/libroot/usr/lib/x86_64-linux-gnu NODE_PATH=/home/agent/makefun-tools/node_modules node /home/agent/makefun/fps2/tools/shoot.mjs "http://127.0.0.1:8792/index.html$1" "$2" "${3:-80}"
