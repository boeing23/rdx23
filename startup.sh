#!/bin/bash
set -e

echo "=== STARTING DJANGO APPLICATION ==="
echo "Current directory: $(pwd)"
export PORT=${PORT:-8000}

# Prepare static files
echo "=== COLLECTING STATIC FILES ==="
python manage.py collectstatic --noinput || echo "Static collection failed but continuing"

# Apply migrations
echo "=== APPLYING MIGRATIONS ==="
python manage.py migrate --noinput || echo "Migration failed but continuing"

# Start server
echo "=== STARTING GUNICORN ==="
echo "Using PORT: $PORT"

# Execute gunicorn
exec gunicorn carpool_project.wsgi:application \
    --bind 0.0.0.0:$PORT \
    --workers 2 \
    --log-file - 