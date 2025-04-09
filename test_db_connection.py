#!/usr/bin/env python
"""
Script to test direct database connection using settings.py values
"""
import os
import sys
import time
import psycopg2
from decouple import config

def test_direct_connection():
    """Test connection using settings.py values"""
    print("Testing direct PostgreSQL connection...")
    
    # Get DB parameters from config
    db_name = config('PGDATABASE', default='railway')
    db_user = config('PGUSER', default='postgres')
    db_password = config('PGPASSWORD', default='tosfOdhOAUDKeqqoSnLSQijNtjBlVkJu')
    db_host = config('PGHOST', default='centerbeam.proxy.rlwy.net')
    db_port = config('PGPORT', default='58612')
    
    print(f"Connection parameters:")
    print(f"Host: {db_host}")
    print(f"Port: {db_port}")
    print(f"Database: {db_name}")
    print(f"User: {db_user}")
    
    try:
        start_time = time.time()
        conn = psycopg2.connect(
            dbname=db_name,
            user=db_user,
            password=db_password,
            host=db_host,
            port=db_port
        )
        cursor = conn.cursor()
        
        cursor.execute("SELECT version()")
        version = cursor.fetchone()[0]
        
        cursor.execute("SELECT current_database(), current_user")
        db_info = cursor.fetchone()
        
        elapsed = time.time() - start_time
        
        print(f"✅ Connection successful ({elapsed:.2f}s)")
        print(f"Database: {db_info[0]}, User: {db_info[1]}")
        print(f"PostgreSQL version: {version}")
        
        # Test a sample query
        cursor.execute("SELECT COUNT(*) FROM pg_catalog.pg_tables WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema'")
        table_count = cursor.fetchone()[0]
        print(f"Number of tables: {table_count}")
        
        cursor.close()
        conn.close()
        return True
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False

if __name__ == "__main__":
    print("\n=== TESTING DATABASE CONNECTION ===")
    if test_direct_connection():
        print("\n✅ Direct connection successful!")
        sys.exit(0)
    else:
        print("\n❌ Connection failed. Check your configuration.")
        sys.exit(1) 