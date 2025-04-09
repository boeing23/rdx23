#!/usr/bin/env python
"""
Test script to diagnose PostgreSQL connection issues on Railway.
Run with: railway run python test_pg_connection.py
"""

import os
import sys
import time
import socket
import logging
from urllib.parse import urlparse
import traceback

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger('pg_test')

def print_header(text):
    """Print formatted header"""
    print("\n" + "=" * 60)
    print(f" {text}")
    print("=" * 60)

def test_network():
    """Test basic network connectivity"""
    print_header("NETWORK CONNECTIVITY TEST")
    
    test_hosts = [
        ("www.google.com", 80),
        ("www.cloudflare.com", 443),
        ("aws.amazon.com", 443)
    ]
    
    for host, port in test_hosts:
        print(f"Testing connection to {host}:{port}...")
        try:
            start_time = time.time()
            sock = socket.create_connection((host, port), timeout=5)
            elapsed = time.time() - start_time
            sock.close()
            print(f"✅ Successfully connected to {host}:{port} in {elapsed:.2f}s")
        except Exception as e:
            print(f"❌ Failed to connect to {host}:{port}: {e}")

def test_dns_resolution():
    """Test DNS resolution"""
    print_header("DNS RESOLUTION TEST")
    
    hosts_to_test = [
        "www.google.com",
        "postgres.railway.internal",
        "railway.app"
    ]
    
    for host in hosts_to_test:
        print(f"Resolving {host}...")
        try:
            ip_address = socket.gethostbyname(host)
            print(f"✅ Resolved {host} to {ip_address}")
        except socket.gaierror as e:
            print(f"❌ Failed to resolve {host}: {e}")

def test_postgres_connection():
    """Test PostgreSQL connection"""
    print_header("POSTGRESQL CONNECTION TEST")
    
    # Check if DATABASE_URL is set
    if 'DATABASE_URL' not in os.environ:
        print("❌ DATABASE_URL environment variable not set")
        return False
    
    db_url = os.environ['DATABASE_URL']
    
    # Parse the URL
    try:
        parsed = urlparse(db_url)
        db_host = parsed.hostname
        db_port = parsed.port or 5432
        db_name = parsed.path.strip('/')
        db_user = parsed.username
        
        # Print sanitized connection info
        print(f"Database host: {db_host}")
        print(f"Database port: {db_port}")
        print(f"Database name: {db_name}")
        print(f"Database user: {db_user}")
    except Exception as e:
        print(f"❌ Failed to parse DATABASE_URL: {e}")
        return False
    
    # Try to resolve the hostname
    print(f"\nResolving database hostname {db_host}...")
    try:
        ip_address = socket.gethostbyname(db_host)
        print(f"✅ Resolved {db_host} to {ip_address}")
    except socket.gaierror as e:
        print(f"❌ Failed to resolve {db_host}: {e}")
        
        # Special handling for postgres.railway.internal
        if db_host == "postgres.railway.internal":
            print("\nThis is a Railway internal hostname. Adding entry to /etc/hosts is recommended.")
            print("You can use this command in your startup script:")
            print('echo "127.0.0.1 postgres.railway.internal" >> /etc/hosts')
    
    # Try to connect to the database
    print("\nTesting raw socket connection to database...")
    try:
        sock = socket.create_connection((db_host, db_port), timeout=5)
        print(f"✅ Successfully connected to {db_host}:{db_port}")
        sock.close()
    except Exception as e:
        print(f"❌ Failed to connect to {db_host}:{db_port}: {e}")
    
    # Try to connect using psycopg2
    print("\nTesting PostgreSQL connection with psycopg2...")
    try:
        import psycopg2
        conn = psycopg2.connect(
            dbname=db_name,
            user=db_user,
            password=parsed.password,
            host=db_host,
            port=db_port,
            connect_timeout=10
        )
        print("✅ Successfully connected to PostgreSQL")
        
        # Test a simple query
        cursor = conn.cursor()
        cursor.execute("SELECT version()")
        version = cursor.fetchone()[0]
        print(f"PostgreSQL version: {version}")
        
        # Check if our tables exist
        cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
        tables = cursor.fetchall()
        print(f"Found {len(tables)} tables:")
        for table in tables:
            print(f"- {table[0]}")
        
        conn.close()
        return True
    except ImportError:
        print("❌ psycopg2 module not installed. Install with: pip install psycopg2-binary")
    except Exception as e:
        print(f"❌ Failed to connect to PostgreSQL: {e}")
        traceback.print_exc()
    
    return False

def test_django_connection():
    """Test Django database connection"""
    print_header("DJANGO DATABASE CONNECTION TEST")
    
    try:
        import django
        print(f"Django version: {django.get_version()}")
        
        # Configure Django
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'carpool_project.settings_production')
        django.setup()
        
        # Test connection
        from django.db import connections
        connection = connections['default']
        connection.ensure_connection()
        print("✅ Successfully connected to database through Django")
        
        # Get connection details
        db_settings = connection.settings_dict
        print(f"Engine: {db_settings['ENGINE']}")
        print(f"Name: {db_settings['NAME']}")
        print(f"Host: {db_settings['HOST']}")
        print(f"Port: {db_settings['PORT']}")
        
        # Test a simple query
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            result = cursor.fetchone()
            print(f"Query result: {result}")
        
        return True
    except Exception as e:
        print(f"❌ Failed to connect to database through Django: {e}")
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print(f"Starting PostgreSQL connection tests at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Python version: {sys.version}")
    print(f"Current directory: {os.getcwd()}")
    
    # Run all tests
    test_network()
    test_dns_resolution()
    postgres_ok = test_postgres_connection()
    django_ok = test_django_connection()
    
    # Summary
    print_header("TEST SUMMARY")
    print(f"PostgreSQL direct connection: {'✅ PASS' if postgres_ok else '❌ FAIL'}")
    print(f"Django database connection: {'✅ PASS' if django_ok else '❌ FAIL'}")
    
    if not postgres_ok or not django_ok:
        print("\nRecommendations:")
        print("1. Check if the DATABASE_URL environment variable is correct")
        print("2. Verify that the PostgreSQL service is running")
        print("3. Check if the hostname can be resolved")
        print("4. If using postgres.railway.internal, add it to /etc/hosts")
        
        sys.exit(1)
    else:
        print("\n✅ All database connection tests passed successfully!")
        sys.exit(0) 