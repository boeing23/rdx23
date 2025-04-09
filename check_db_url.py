#!/usr/bin/env python
"""
Script to test both internal and public database URLs
"""
import os
import sys
import time
import psycopg2

def test_connection(url_name, url):
    """Test connection to a database URL"""
    print(f"\nTesting {url_name} connection...")
    print(f"URL starts with: {url[:15]}...")
    
    try:
        start_time = time.time()
        conn = psycopg2.connect(url)
        cursor = conn.cursor()
        
        cursor.execute("SELECT version()")
        version = cursor.fetchone()[0]
        
        cursor.execute("SELECT current_database(), current_user")
        db_info = cursor.fetchone()
        
        elapsed = time.time() - start_time
        
        print(f"✅ Connection successful ({elapsed:.2f}s)")
        print(f"Database: {db_info[0]}, User: {db_info[1]}")
        print(f"PostgreSQL version: {version}")
        
        cursor.close()
        conn.close()
        return True
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False

def main():
    """Test both database URLs"""
    internal_url = os.environ.get('DATABASE_URL')
    public_url = os.environ.get('DATABASE_PUBLIC_URL')
    
    print(f"Internal URL exists: {bool(internal_url)}")
    print(f"Public URL exists: {bool(public_url)}")
    
    internal_success = False
    public_success = False
    
    if internal_url:
        internal_success = test_connection("INTERNAL", internal_url)
        
    if public_url:
        public_success = test_connection("PUBLIC", public_url)
    
    print("\nSummary:")
    print(f"Internal URL: {'✅ Working' if internal_success else '❌ Failed'}")
    print(f"Public URL: {'✅ Working' if public_success else '❌ Failed'}")
    
    if not (internal_success or public_success):
        print("\n❌ CRITICAL: Both database connections failed!")
        return 1
    
    if public_success and not internal_success:
        print("\n⚠️ Recommendation: Use only the PUBLIC_URL for your application")
    
    return 0

if __name__ == "__main__":
    sys.exit(main()) 