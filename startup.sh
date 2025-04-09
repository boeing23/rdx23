#!/bin/bash
set -e

echo "=== STARTING DJANGO APPLICATION ==="
echo "Current directory: $(pwd)"
export PORT=${PORT:-8000}

# Check for DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "WARNING: DATABASE_URL is not set"
fi

# Prepare static files
echo "=== COLLECTING STATIC FILES ==="
python manage.py collectstatic --noinput || echo "Static collection failed but continuing"

# Try to apply migrations with a timeout
echo "=== APPLYING MIGRATIONS ==="
# Using timeout to prevent hanging
timeout 30s python manage.py migrate --noinput || echo "Migration failed or timed out, but continuing"

# Start server
echo "=== STARTING GUNICORN ==="
echo "Using PORT: $PORT"

# Execute gunicorn with timeout settings
exec gunicorn railway_wsgi:application \
    --bind 0.0.0.0:$PORT \
    --workers 2 \
    --timeout 30 \
    --log-file - 