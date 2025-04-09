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
  
  # Parse DATABASE_URL to get host and port
  DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\).*/\1/p')
  echo "Database host: $DB_HOST"
  
  # Try to resolve the hostname
  echo "Trying to resolve database hostname..."
  if host $DB_HOST 2>/dev/null; then
    echo "✅ Database hostname resolution successful"
  else
    echo "⚠️ Failed to resolve database hostname: $DB_HOST"
    echo "This might cause connection issues. Adding entry to /etc/hosts..."
    
    # If this is postgres.railway.internal, add it to hosts file
    if [[ "$DB_HOST" == "postgres.railway.internal" ]]; then
      echo "Adding postgres.railway.internal to /etc/hosts..."
      echo "127.0.0.1 postgres.railway.internal" >> /etc/hosts
      echo "Added postgres.railway.internal to /etc/hosts"
    fi
  fi
  
  # Check if we can connect to the database
  echo "Testing database connection..."
  python -c "
import os, sys, time, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'carpool_project.settings_production')

# Try multiple times to connect
max_retries = 5
retry_delay = 3

for attempt in range(max_retries):
    try:
        print(f'Database connection attempt {attempt+1}/{max_retries}')
        django.setup()
        from django.db import connections
        connections['default'].ensure_connection()
        print('✅ Database connection successful')
        sys.exit(0)
    except Exception as e:
        print(f'❌ Database connection failed: {str(e)}')
        if attempt < max_retries - 1:
            print(f'Retrying in {retry_delay} seconds...')
            time.sleep(retry_delay)
            retry_delay *= 1.5  # Exponential backoff
        else:
            print('All connection attempts failed')
            # Continue anyway
            sys.exit(0)
" || echo "Database connection test failed but continuing"
fi

# Check if tables exist first using a specific script
echo "=== CHECKING DATABASE SCHEMA AND MIGRATIONS ==="
python check_migrations_status.py || echo "Migration check failed but continuing"

# If tables don't exist, use our fix migrations script
echo "=== RUNNING MIGRATION FIXES IF NEEDED ==="
python fix_migrations.py || echo "Migration fixes failed but continuing"

# Try Django check but don't fail if it errors
echo "=== DJANGO CHECK ==="
python manage.py check || echo "Django check failed but continuing"

# Try to get Django version
python -c "import django; print(f'Django version: {django.__version__}')" || echo "Failed to get Django version"

# Apply database migrations but don't fail if they error
echo "=== APPLYING MIGRATIONS ==="
python manage.py migrate --fake-initial || echo "Initial migrations failed but continuing"
python manage.py migrate || echo "Migrations failed but continuing"

# Run a post-deployment check
echo "=== VERIFYING DATABASE SETUP ==="
python check_migrations_status.py || echo "Final migration check failed but continuing"

# Start the actual application with exec to replace this process
echo "=== STARTING GUNICORN ==="
export PORT=${PORT:-8000}
echo "Using PORT: $PORT"

# Use our custom railway_wsgi.py file for better error handling
echo "=== STARTING GUNICORN with RAILWAY_WSGI ==="
exec gunicorn railway_wsgi:application \
    --bind 0.0.0.0:$PORT \
    --timeout 180 \
    --graceful-timeout 60 \
    --keep-alive 5 \
    --workers 1 \
    --max-requests 1000 \
    --max-requests-jitter 50 \
    --worker-class sync \
    --log-level debug \
    --capture-output \
    --enable-stdio-inheritance \
    --error-logfile - \
    --access-logfile - \
    2>&1 