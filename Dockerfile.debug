FROM python:3.10-slim

WORKDIR /app

# Install basic utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install psutil for monitoring
RUN pip install --no-cache-dir psutil

# Copy only the debug server
COPY debug_server.py .
RUN chmod +x debug_server.py

# Set the default port
ENV PORT=8000

# Health check that uses curl
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:$PORT/ || exit 1

# Make sure the container doesn't exit
CMD ["python", "debug_server.py"] 