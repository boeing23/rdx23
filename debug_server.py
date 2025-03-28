#!/usr/bin/env python
"""
Enhanced debug server that stays alive and logs errors
"""

import os
import sys
import time
import traceback
import socket
import platform
import psutil
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

# Global variables to track stats
REQUEST_COUNT = 0
START_TIME = time.time()

class EnhancedHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global REQUEST_COUNT
        REQUEST_COUNT += 1
        
        try:
            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            
            # Get memory usage
            process = psutil.Process(os.getpid())
            memory_info = process.memory_info()
            
            # Print system and request info
            uptime = time.time() - START_TIME
            
            env_info = "\n".join([
                f"{k}={v}" for k, v in os.environ.items() 
                if not ("SECRET" in k or "PASSWORD" in k or "KEY" in k)
            ])
            
            response = f"""
=== RAILWAY DEBUG SERVER ===
Path: {self.path}
Request #{REQUEST_COUNT}
Server uptime: {uptime:.2f} seconds

=== SYSTEM INFO ===
Python version: {sys.version}
Platform: {platform.platform()}
Hostname: {socket.gethostname()}
Process ID: {os.getpid()}
Memory usage: {memory_info.rss / 1024 / 1024:.2f} MB
CPU count: {psutil.cpu_count()}

=== ENVIRONMENT VARIABLES ===
{env_info}

=== STATUS: OK ===
"""
            self.wfile.write(response.encode())
            
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Handled request #{REQUEST_COUNT} to {self.path}")
            
        except Exception as e:
            print(f"ERROR handling request: {e}")
            traceback.print_exc()
            # Still try to send a response
            self.wfile.write(f"ERROR: {str(e)}".encode())

def log_stats():
    """Thread to periodically log stats"""
    while True:
        try:
            process = psutil.Process(os.getpid())
            memory_info = process.memory_info()
            uptime = time.time() - START_TIME
            
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] "
                  f"STATS: Uptime={uptime:.2f}s, "
                  f"Requests={REQUEST_COUNT}, "
                  f"Memory={memory_info.rss / 1024 / 1024:.2f}MB")
        except Exception as e:
            print(f"Error logging stats: {e}")
        
        time.sleep(30)  # Log every 30 seconds

def run_server():
    try:
        port = int(os.environ.get('PORT', 8000))
        print(f"Starting enhanced debug server on port {port}")
        
        # Start stats logging thread
        stats_thread = threading.Thread(target=log_stats, daemon=True)
        stats_thread.start()
        
        # Start the server
        server = HTTPServer(('0.0.0.0', port), EnhancedHandler)
        print(f"Server started at http://0.0.0.0:{port}")
        
        # Register signals
        import signal
        def signal_handler(sig, frame):
            print(f"Received signal {sig}, shutting down gracefully")
            server.server_close()
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        # Serve forever
        server.serve_forever()
        
    except Exception as e:
        print(f"FATAL ERROR starting server: {e}")
        traceback.print_exc()
        
        # Keep the container alive even if server fails
        print("Keeping container alive despite error...")
        while True:
            time.sleep(60)
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Container still alive")

if __name__ == "__main__":
    # Install safety net for unhandled exceptions
    sys._excepthook = sys.excepthook
    def exception_hook(exctype, value, tb):
        print(f"UNHANDLED EXCEPTION: {exctype}: {value}")
        traceback.print_exception(exctype, value, tb)
        # Keep the process alive
        while True:
            time.sleep(60)
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Process alive after unhandled exception")
    
    sys.excepthook = exception_hook
    
    run_server() 