#!/bin/bash
# wait-for-it.sh - Wait for a service to be available

set -e

# Extract host and port from DATABASE_URL
# Assumes format: postgres://username:password@host:port/database
if [ -n "$DATABASE_URL" ]; then
  # Extract host and port from DATABASE_URL
  DB_HOST=$(echo $DATABASE_URL | sed -e 's/^.*@//' -e 's/:.*//' -e 's/\/.*//')
  DB_PORT=$(echo $DATABASE_URL | sed -e 's/^.*://' -e 's/\/.*//')
else
  # Default values if DATABASE_URL is not set
  DB_HOST=${DB_HOST:-localhost}
  DB_PORT=${DB_PORT:-5432}
fi

echo "Waiting for database at $DB_HOST:$DB_PORT..."

# Wait for the database to be ready
RETRIES=30
until [ $RETRIES -eq 0 ]; do
  echo "Checking database connection..."
  timeout 1 bash -c "cat < /dev/null > /dev/tcp/$DB_HOST/$DB_PORT" 2>/dev/null
  
  result=$?
  if [ $result -eq 0 ]; then
    echo "Database is available."
    break
  fi
  
  echo "Database is unavailable - sleeping"
  RETRIES=$((RETRIES-1))
  sleep 1
done

if [ $RETRIES -eq 0 ]; then
  echo "Could not connect to database after multiple attempts. Continuing anyway..."
fi

# Apply migrations if possible
echo "Applying migrations..."
python manage.py migrate --noinput || echo "Migrations failed, but continuing..."

# Execute the command passed to this script
echo "Starting application..."
exec "$@" 