#!/bin/bash
# Quick save: stage everything, commit, push
set -e

MSG="${1:-auto: save progress}"

git add .
git commit -m "$MSG" --no-verify
git push origin main

echo "Saved and pushed: $MSG"
