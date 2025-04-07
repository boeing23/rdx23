import os
import sys
import django
import json
from django.db import connection

# Set up Django environment with production settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'carpool_project.settings')
django.setup()

# Get database settings
db_settings = connection.settings_dict
print("Database Connection Info:")
print(f"ENGINE: {db_settings['ENGINE']}")
print(f"NAME: {db_settings['NAME']}")
print(f"USER: {db_settings['USER']}")
print(f"HOST: {db_settings['HOST']}")
print(f"PORT: {db_settings['PORT']}")

# Try to establish connection
try:
    connection.ensure_connection()
    print("\nDatabase connection successful!")
    
    # List all tables
    with connection.cursor() as cursor:
        tables = connection.introspection.table_names(cursor)
        print(f"\nFound {len(tables)} tables:")
        for table in tables:
            print(f"- {table}")
            
        # Get count of records in key tables
        cursor.execute("SELECT COUNT(*) FROM rides_ride")
        ride_count = cursor.fetchone()[0]
        print(f"\nrides_ride record count: {ride_count}")
        
        cursor.execute("SELECT COUNT(*) FROM rides_riderequest")
        request_count = cursor.fetchone()[0]
        print(f"rides_riderequest record count: {request_count}")
        
        # Check for optimal pickup points
        cursor.execute("SELECT COUNT(*) FROM rides_riderequest WHERE optimal_pickup_point IS NOT NULL")
        with_pickup = cursor.fetchone()[0]
        print(f"RideRequests with optimal pickup points: {with_pickup}")
        
        # Get most recent ride request
        if request_count > 0:
            cursor.execute("SELECT id, created_at, status, rider_id, optimal_pickup_point, nearest_dropoff_point FROM rides_riderequest ORDER BY created_at DESC LIMIT 1")
            latest = cursor.fetchone()
            print(f"\nMost recent ride request:")
            print(f"ID: {latest[0]}")
            print(f"Created: {latest[1]}")
            print(f"Status: {latest[2]}")
            print(f"Rider ID: {latest[3]}")
            print(f"Has optimal pickup: {'Yes' if latest[4] else 'No'}")
            print(f"Has nearest dropoff: {'Yes' if latest[5] else 'No'}")
except Exception as e:
    print(f"\nDatabase connection failed: {e}")
    print("\nCheck if the DATABASE_URL environment variable is correctly set.") 