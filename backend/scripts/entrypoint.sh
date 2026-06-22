#!/bin/sh
# Runs on every container start before the Node process launches.
# Using /bin/sh (not bash) because Alpine only ships sh.
set -e  # exit immediately on any error

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting server..."
exec node dist/server.js
