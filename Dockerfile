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
    procps \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Ensure scripts are executable
RUN chmod +x wait-for-it.sh entrypoint.sh

# Make health check script
RUN echo '#!/bin/bash\ncurl -f http://localhost:${PORT:-8000}/health/ || exit 1' > /healthcheck.sh && chmod +x /healthcheck.sh

# Collect static files with fallback
RUN python manage.py collectstatic --noinput || echo "Static collection failed but continuing"

# Health check
HEALTHCHECK --interval=5s --timeout=3s --retries=3 CMD /healthcheck.sh

# Set the default port
ENV PORT=8000

# Start command
CMD ["./entrypoint.sh"] 