#!/bin/sh
set -e
# Services with a Prisma schema create/update their own DB schema first.
# No --accept-data-loss: a destructive change fails the start instead of dropping data.
if [ -f prisma/schema.prisma ]; then
  node_modules/.bin/prisma db push --skip-generate
fi
exec node dist/index.js
