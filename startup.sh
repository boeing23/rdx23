#!/bin/bash
set -e

echo "=== RAILWAY APP STARTUP === $(date -u)"
echo "Current directory: $(pwd)"
export PORT=${PORT:-8000}

# Set PostgreSQL environment variables if using DATABASE_PUBLIC_URL
if [ -n "$DATABASE_PUBLIC_URL" ]; then
  # Extract components from the URL - example: postgresql://user:pass@hostname:port/dbname
  export PGDATABASE=$(echo $DATABASE_PUBLIC_URL | sed -E 's/.*\/([^?]*).*/\1/')
  export PGUSER=$(echo $DATABASE_PUBLIC_URL | sed -E 's/.*:\/\/([^:]*).*/\1/')
  export PGPASSWORD=$(echo $DATABASE_PUBLIC_URL | sed -E 's/.*:\/\/[^:]*:([^@]*)@.*/\1/')
  export PGHOST=$(echo $DATABASE_PUBLIC_URL | sed -E 's/.*@([^:]*).*/\1/')
  export PGPORT=$(echo $DATABASE_PUBLIC_URL | sed -E 's/.*:([0-9]*)\/.*/\1/')
  
  echo "Extracted PostgreSQL settings from DATABASE_PUBLIC_URL:"
  echo "- PGHOST: $PGHOST"
  echo "- PGPORT: $PGPORT"
  echo "- PGDATABASE: $PGDATABASE"
  echo "- PGUSER: $PGUSER"
  # Password not shown for security
fi

# Retry mechanism for database connection using PGHOST and PGPORT
echo "=== CHECKING DATABASE CONNECTION ==="
MAX_RETRIES=15
RETRY_INTERVAL=5
count=0

echo "Checking direct PostgreSQL connection..."
until PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE -c "SELECT 1" > /dev/null 2>&1
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