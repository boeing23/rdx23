#!/bin/bash
set -e

# Print debugging information
echo "=== RAILWAY APP STARTUP === $(date -u)"
echo "Python version: $(python --version)"
echo "Current directory: $(pwd)"
echo "Files in current directory: $(ls -la)"

# Ensure RAILWAY_ENVIRONMENT is set
export RAILWAY_ENVIRONMENT=true

# Test network and DNS
echo "=== NETWORK TEST ==="
curl -v --max-time 5 https://www.google.com 2>&1 | grep -E '(Connected to|HTTP/)'
echo "Network test completed"

# Print all environment variables (sanitized)
echo "=== ENVIRONMENT VARIABLES (sanitized) ==="
env | grep -v -E 'SECRET|PASSWORD|KEY|DATABASE_URL' | sort

# Check if DATABASE_URL exists
if [ -z "$DATABASE_URL" ]; then
  echo "WARNING: DATABASE_URL is not set - this will cause connection issues"
else
  echo "DATABASE_URL is set (contents not shown for security)"
fi

# Try Django check but don't fail if it errors
echo "=== DJANGO CHECK ==="
python manage.py check || echo "Django check failed but continuing"

# Try to get Django version
python -c "import django; print(f'Django version: {django.__version__}')" || echo "Failed to get Django version"

# Test direct connection to the app
echo "=== TESTING ROOT ENDPOINT ==="
(curl -v --max-time 5 http://localhost:${PORT:-8000}/ || echo "Failed to connect to localhost") &
sleep 5
echo "Root endpoint test completed"

# Retry mechanism for database connection
MAX_RETRIES=30
RETRY_INTERVAL=5
count=0

echo "Checking for database availability..."
until python -c "import psycopg2; conn = psycopg2.connect(\"${DATABASE_URL}\"); conn.close()" 2>/dev/null
do
  count=$((count+1))
  if [ $count -ge $MAX_RETRIES ]; then
    echo "Failed to connect to database after $MAX_RETRIES attempts, but starting anyway..."
    break
  fi
  echo "Database not available yet, retrying in ${RETRY_INTERVAL}s... (Attempt $count/$MAX_RETRIES)"
  sleep $RETRY_INTERVAL
done

if [ $count -lt $MAX_RETRIES ]; then
  echo "Database is available!"
fi

# Prepare for statically served files
echo "Running collectstatic..."
python manage.py collectstatic --noinput || echo "Static collection failed but continuing"

# Apply database migrations
echo "Applying migrations..."
python manage.py migrate --noinput || echo "Migration failed but continuing"

# Run any needed fixture loading
# python manage.py loaddata initial_data.json || echo "Loading fixtures failed but continuing"

# Start server with more worker timeout
echo "Starting Gunicorn server..."
gunicorn carpool_project.wsgi --preload --timeout 120 --log-file -

# Start the actual application with exec to replace this process
echo "=== STARTING GUNICORN ==="
export PORT=${PORT:-8000}
echo "Using PORT: $PORT"

# Try to check database connection directly
echo "=== DATABASE CONNECTION TEST ==="
python -c "
import os, sys, django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'carpool_project.settings_production')
django.setup()

from django.db import connections
try:
    db = connections['default']
    db.ensure_connection()
    print('✅ Database connection successful')
    from django.conf import settings
    db_settings = settings.DATABASES['default']
    engine = db_settings.get('ENGINE', 'unknown')
    name = db_settings.get('NAME', 'unknown')
    host = db_settings.get('HOST', 'unknown')
    print(f'Connected to {engine} database {name} on {host}')
except Exception as e:
    print(f'❌ Database connection failed: {str(e)}')
    print('Continuing despite database error...')
" || echo "Database check failed to run"

# Use our custom railway_wsgi.py file for better error handling
echo "=== STARTING GUNICORN with RAILWAY_WSGI ==="
exec gunicorn railway_wsgi:application \
    --bind 0.0.0.0:$PORT \
    --timeout 120 \
    --workers 1 \
    --max-requests 1000 \
    --max-requests-jitter 50 \
    --log-level debug \
    --capture-output \
    --enable-stdio-inheritance \
    --error-logfile - \
    --access-logfile - \
    2>&1 