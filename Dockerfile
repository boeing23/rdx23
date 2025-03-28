FROM python:3.10-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PRODUCTION=True

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    netcat-traditional \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Ensure wait-for-it.sh is executable
COPY wait-for-it.sh /wait-for-it.sh
RUN chmod +x /wait-for-it.sh

# Collect static files with fallback
RUN python manage.py collectstatic --noinput || true

# Start command using wait-for-it
CMD /wait-for-it.sh gunicorn carpool_project.wsgi:application --bind 0.0.0.0:${PORT:-8000} --timeout 120 --workers 3 --log-level debug 