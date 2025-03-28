FROM python:3.10-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PRODUCTION=True

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Print directory contents for debugging
RUN echo "=== Files in /app ===" && ls -la

# Collect static files with fallback
RUN python manage.py collectstatic --noinput || echo "Static collection failed but continuing"

# Health check - using shell form to ensure PORT gets expanded
HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8000}/ || exit 1

# Set the default port
ENV PORT=8000

# Django start command - using shell form for proper variable expansion
CMD gunicorn carpool_project.wsgi:application --bind 0.0.0.0:${PORT:-8000} --timeout 120 --workers 1 --log-level debug 