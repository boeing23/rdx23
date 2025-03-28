#!/bin/bash
set -e

echo "=== RAILWAY APP STARTUP ==="
echo "Python version: $(python --version)"
echo "Django version: $(python -m django --version 2>/dev/null || echo 'Unable to detect')"
echo "Current directory: $(pwd)"
echo "Files in current directory: $(ls -la)"
echo "=== END INFO ==="

# Check PORT is set
if [ -z "$PORT" ]; then
  echo "PORT is not set, defaulting to 8000"
  export PORT=8000
fi

# Start application with wait-for-it
echo "Starting application on port $PORT"
exec "./wait-for-it.sh" gunicorn carpool_project.wsgi:application --bind "0.0.0.0:$PORT" --timeout 120 --workers 2 --log-level debug 