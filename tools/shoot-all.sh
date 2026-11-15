#!/bin/sh
# Retake every screenshot listed in shots.json into screenshots/ (old ones removed first).
cd /home/agent/makefun/fps2 && rm -f screenshots/*.jpg && node -e "for (const s of require('./shots.json')) console.log(s.name + ' ' + s.query)" | while read name query; do
  tools/shoot.sh "$query" "/home/agent/makefun/fps2/screenshots/$name" 82
done
ls -la screenshots
