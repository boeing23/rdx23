#!/bin/bash
set -e

echo "=== STARTING LOCAL DEVELOPMENT SERVER ==="
echo "Current directory: $(pwd)"
export PORT=${PORT:-8000}

# Prepare static files
echo "=== COLLECTING STATIC FILES ==="
python manage.py collectstatic --noinput || echo "Static collection failed but continuing"

# Try to apply migrations with a timeout
echo "=== APPLYING MIGRATIONS ==="
python manage.py migrate --noinput || echo "Migration failed, but continuing"

# Start with simpler configuration
echo "=== STARTING GUNICORN ==="
echo "Using PORT: $PORT"

# Execute gunicorn with increased timeout and simplified config
exec gunicorn carpool_project.wsgi:application \
    --config gunicorn_config.py 