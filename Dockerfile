# Use a specific Python version for stability
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PRODUCTION=True
ENV RAILWAY_ENVIRONMENT=True
ENV DISABLE_DATABASE_OPERATIONS=True

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
HEALTHCHECK --interval=15s --timeout=10s --start-period=60s --retries=5 \
  CMD curl -f http://localhost:${PORT:-8000}/railway-status/ || exit 1

# Set the default port
ENV PORT=8000

# Run startup script
CMD ["./startup.sh"] 