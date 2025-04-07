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

# Make startup script executable
RUN chmod +x startup.sh

# Print directory contents for debugging
RUN echo "=== Files in /app ===" && ls -la

# Collect static files with fallback
RUN python manage.py collectstatic --noinput || echo "Static collection failed but continuing"

# Health check - using shell form to ensure PORT gets expanded and using railway-status endpoint
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8000}/railway-status/ || exit 1

# Set the default port
ENV PORT=8000

# Using startup script with enhanced logging
CMD ["./startup.sh"] 