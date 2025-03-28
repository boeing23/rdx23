#!/usr/bin/env python
"""
Ultra-simple HTTP server that always returns 200 OK.
Used for debugging deployment issues.
"""

import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

class SimpleHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        
        # Print some debug info in the response
        env_info = "\n".join([
            f"{k}={v}" for k, v in os.environ.items() 
            if not ("SECRET" in k or "PASSWORD" in k or "KEY" in k)
        ])
        
        response = f"""
=== RAILWAY DEBUG SERVER ===
Path: {self.path}
Python version: {sys.version}
PORT: {os.environ.get('PORT', '8000')}

=== ENVIRONMENT VARIABLES ===
{env_info}

=== STATUS: OK ===
"""
        self.wfile.write(response.encode())

def run_server():
    port = int(os.environ.get('PORT', 8000))
    print(f"Starting simple debug server on port {port}")
    
    server = HTTPServer(('0.0.0.0', port), SimpleHandler)
    print(f"Server started at http://0.0.0.0:{port}")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Server stopped by user")
    except Exception as e:
        print(f"Server error: {e}")

if __name__ == "__main__":
    run_server() 