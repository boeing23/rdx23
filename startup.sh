#!/bin/bash
set -e

# Print debugging information
echo "=== RAILWAY APP STARTUP ==="
echo "Python version: $(python --version)"
echo "Current directory: $(pwd)"
echo "Files in current directory: $(ls -la)"
echo "=== ENVIRONMENT VARIABLES (sanitized) ==="
env | grep -v -E 'SECRET|PASSWORD|KEY' | sort

# Try Django check
echo "=== DJANGO CHECK ==="
python manage.py check || echo "Django check failed"

# Apply database migrations
echo "=== APPLYING MIGRATIONS ==="
python manage.py migrate || echo "Migrations failed"

# Try to get Django version
python -c "import django; print(f'Django version: {django.__version__}')" || echo "Failed to get Django version"

# Try to check database connection
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
" || echo "Database check failed to run"

# Start the actual application with exec to replace this process
echo "=== STARTING GUNICORN ==="
export PORT=${PORT:-8000}
echo "Using PORT: $PORT"

# Execute the command with all output redirected to stdout
exec gunicorn carpool_project.wsgi:application \
    --bind 0.0.0.0:$PORT \
    --timeout 120 \
    --workers 1 \
    --log-level debug \
    2>&1 