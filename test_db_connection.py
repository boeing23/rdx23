#!/usr/bin/env python
"""
A script to test database connectivity on Railway.
This can be run directly to troubleshoot database connection issues.
"""

import os
import sys
import time
import psycopg2
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_database_connection(db_url=None):
    """Test connection to the PostgreSQL database."""
    if not db_url:
        db_url = os.environ.get('DATABASE_URL')
        if not db_url:
            logger.error("No DATABASE_URL environment variable found")
            return False
    
    logger.info(f"Testing connection to database (URL starts with: {db_url[:15]}...)")
    
    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
        
        # Test query
        cursor.execute("SELECT 1")
        result = cursor.fetchone()
        
        # Get PostgreSQL version
        cursor.execute("SELECT version()")
        version = cursor.fetchone()[0]
        
        # Get connection info
        cursor.execute("SELECT current_database(), current_user")
        db_info = cursor.fetchone()
        
        cursor.close()
        conn.close()
        
        logger.info(f"Database connection successful!")
        logger.info(f"PostgreSQL version: {version}")
        logger.info(f"Database: {db_info[0]}, User: {db_info[1]}")
        
        return True
    except Exception as e:
        logger.error(f"Database connection error: {str(e)}")
        return False

def retry_connection(max_retries=30, delay=5):
    """Retry the database connection with exponential backoff."""
    for attempt in range(1, max_retries + 1):
        logger.info(f"Connection attempt {attempt}/{max_retries}")
        
        if test_database_connection():
            logger.info("Successfully connected to the database")
            return True
        
        if attempt < max_retries:
            wait_time = delay
            logger.info(f"Retrying in {wait_time} seconds...")
            time.sleep(wait_time)
    
    logger.error(f"Failed to connect after {max_retries} attempts")
    return False

if __name__ == "__main__":
    print("==== DATABASE CONNECTION TEST ====")
    print(f"Python version: {sys.version}")
    print(f"Current directory: {os.getcwd()}")
    
    # Test both PUBLIC and INTERNAL URLs if available
    public_url = os.environ.get('DATABASE_PUBLIC_URL')
    internal_url = os.environ.get('DATABASE_URL')
    
    success = False
    
    if public_url:
        print("\nTesting PUBLIC database URL...")
        success = test_database_connection(public_url)
        
    if internal_url and not success:
        print("\nTesting INTERNAL database URL...")
        success = retry_connection()
    
    sys.exit(0 if success else 1) 