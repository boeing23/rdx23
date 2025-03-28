FROM python:3.10-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

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

# Create a script to wait for database and run migrations
COPY wait-for-it.sh /wait-for-it.sh
RUN chmod +x /wait-for-it.sh

# Collect static files
RUN python manage.py collectstatic --noinput

# Run gunicorn with increased timeout and workers
CMD ["gunicorn", "carpool_project.wsgi:application", "--bind", "0.0.0.0:$PORT", "--timeout", "120", "--workers", "4", "--log-level", "debug"] 