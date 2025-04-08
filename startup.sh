#!/bin/bash
set -e

echo "=== RAILWAY APP STARTUP === $(date -u)"
echo "Current directory: $(pwd)"
export PORT=${PORT:-8000}

# Retry mechanism for database connection
echo "=== CHECKING DATABASE CONNECTION ==="
MAX_RETRIES=30
RETRY_INTERVAL=5
count=0

# Try connecting with PUBLIC_URL first if available
if [ -n "$DATABASE_PUBLIC_URL" ]; then
  echo "Trying connection with DATABASE_PUBLIC_URL..."
  until python -c "import psycopg2; conn = psycopg2.connect(\"${DATABASE_PUBLIC_URL}\"); conn.close()" 2>/dev/null
  do
    count=$((count+1))
    if [ $count -ge 5 ]; then
      echo "Failed to connect with PUBLIC_URL after 5 attempts, trying internal URL..."
      break
    fi
    echo "Database public connection not available, retrying in ${RETRY_INTERVAL}s... (Attempt $count/5)"
    sleep $RETRY_INTERVAL
  done
fi

# Reset counter for internal URL
count=0
echo "Checking database connection with DATABASE_URL..."
until python -c "import psycopg2; conn = psycopg2.connect(\"${DATABASE_URL}\"); conn.close()" 2>/dev/null
do
  count=$((count+1))
  if [ $count -ge $MAX_RETRIES ]; then
    echo "Failed to connect to database after $MAX_RETRIES attempts."
    echo "Starting server anyway, but expect database errors."
    break
  fi
  echo "Database not available yet, retrying in ${RETRY_INTERVAL}s... (Attempt $count/$MAX_RETRIES)"
  sleep $RETRY_INTERVAL
done

if [ $count -lt $MAX_RETRIES ]; then
  echo "✅ Database connection successful!"
  
  # Run migrations only if DB connection succeeded
  echo "=== APPLYING MIGRATIONS ==="
  python manage.py migrate --noinput || echo "Migrations failed but continuing"
fi

# Prepare static files
echo "=== COLLECTING STATIC FILES ==="
python manage.py collectstatic --noinput || echo "Static collection failed but continuing"

# Start with simple configuration
echo "=== STARTING GUNICORN ==="
echo "Using PORT: $PORT"

# Use a simpler configuration - this is the important part
exec gunicorn carpool_project.wsgi:application \
    --bind 0.0.0.0:$PORT \
    --timeout 120 \
    --workers 2 \
    --log-level info \
    --access-logfile - \
    --error-logfile - 