import multiprocessing
import os

# Worker settings
workers = min(multiprocessing.cpu_count() * 2 + 1, 3)  # Use at most 3 workers
worker_class = 'sync'
threads = 2

# Timeout settings
timeout = 120  # Increase timeout to 120 seconds
graceful_timeout = 60
keep_alive = 5

# Logging
accesslog = '-'
errorlog = '-'
loglevel = 'info'

# Bind
bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"

# Restart workers after this many requests
max_requests = 1000
max_requests_jitter = 50

# Pre-load application code before forking
preload_app = False  # Set to False to avoid blocking issues

def on_starting(server):
    """Log when Gunicorn is starting."""
    server.log.info("Starting Gunicorn with increased timeouts")

def post_worker_init(worker):
    """Log when a worker is initialized."""
    worker.log.info(f"Worker initialized: {worker.pid}")

def worker_abort(worker):
    """Log when a worker is aborted."""
    worker.log.info(f"Worker aborted: {worker.pid}") 