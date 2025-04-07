#!/bin/bash
set -e

# Print debugging information
echo "=== RAILWAY APP STARTUP ==="
echo "Python version: $(python --version)"
echo "Current directory: $(pwd)"
echo "Files in current directory: $(ls -la)"
echo "=== ENVIRONMENT VARIABLES (sanitized) ==="
env | grep -v -E 'SECRET|PASSWORD|KEY' | sort

# Try Django check but don't fail if it errors
echo "=== DJANGO CHECK ==="
python manage.py check || echo "Django check failed but continuing"

# Apply database migrations but don't fail if they error
echo "=== APPLYING MIGRATIONS ==="
python manage.py migrate || echo "Migrations failed but continuing"

# Try to get Django version
python -c "import django; print(f'Django version: {django.__version__}')" || echo "Failed to get Django version"

# Try to check database connection but don't fail
echo "=== DATABASE CHECK ==="
python -c "
import os, sys, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'carpool_project.settings')
django.setup()
from django.db import connections
try:
    connections['default'].ensure_connection()
    print('Database connection successful')
except Exception as e:
    print(f'Database connection failed: {e}')
    print('Continuing despite database error...')
" || echo "Database check failed to run"

# Start the actual application with exec to replace this process
echo "=== STARTING GUNICORN ==="
export PORT=${PORT:-8000}
echo "Using PORT: $PORT"

# Execute gunicorn with increased timeout and retries
exec gunicorn carpool_project.wsgi:application \
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