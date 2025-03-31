#!/bin/bash
# wait-for-it.sh - Wait for a service to be available

set -e

echo "Starting application setup..."

# Print environment for debugging (redacted)
echo "Environment variables available: $(env | grep -v PASSWORD | grep -v SECRET | cut -d= -f1 | tr '\n' ' ')"
echo "PYTHONPATH: $PYTHONPATH"
echo "DJANGO_SETTINGS_MODULE: $DJANGO_SETTINGS_MODULE"
echo "PORT: ${PORT:-8000}"
echo "DATABASE_URL: $(echo $DATABASE_URL | sed 's/\(postgres:\/\/[^:]*\):[^@]*\(@.*\)/\1:REDACTED\2/')"

# Make sure port is set
PORT=${PORT:-8000}

# Try to connect to the database if DATABASE_URL is available
if [ -n "$DATABASE_URL" ]; then
  echo "DATABASE_URL is set, checking connection..."
  
  # Parse connection details
  if [[ $DATABASE_URL == postgres* ]]; then
    # PostgreSQL URL
    PROTO="$(echo $DATABASE_URL | grep :// | sed -e's,^\(.*://\).*,\1,g')"
    URL="$(echo ${DATABASE_URL/$PROTO/})"
    USER="$(echo $URL | grep @ | cut -d@ -f1 | cut -d: -f1)"
    HOST="$(echo ${URL/$USER@/} | cut -d/ -f1 | cut -d: -f1)"
    PORT="$(echo ${URL/$USER@/} | cut -d/ -f1 | cut -d: -f2)"
    PORT="${PORT:-5432}"
    
    echo "Checking PostgreSQL connection to $HOST:$PORT..."
    
    # Try to connect using nc
    for i in $(seq 1 30); do
      echo "Attempt $i: Checking database connection..."
      nc -z -w1 $HOST $PORT > /dev/null 2>&1
      
      if [ $? -eq 0 ]; then
        echo "Database is available!"
        break
      fi
      
      if [ $i -eq 30 ]; then
        echo "Could not connect to database after 30 attempts. Will try to start anyway."
      else
        echo "Database is not yet available. Retrying in 1 second..."
        sleep 1
      fi
    done
  else
    echo "Non-PostgreSQL DATABASE_URL detected. Skipping connection check."
  fi
else
  echo "No DATABASE_URL detected. Skipping database connection check."
fi

# Try applying migrations (but don't fail if they fail)
echo "Attempting to apply database migrations..."
python manage.py showmigrations --list || echo "Failed to check migrations status"
python manage.py migrate --noinput || echo "Migrations failed, but continuing..."

# Start the application
echo "Starting Django application on port ${PORT}..."
exec "$@" 