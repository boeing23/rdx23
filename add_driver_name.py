"""
Utility script to add driver_name field to rides_ride table 
and populate it with data from users_user table.
"""

import os
import psycopg2
import django
from django.conf import settings

# Configure Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'carpool_project.settings')
django.setup()

# Get database URL from Django settings
from django.db import connections

def update_driver_names():
    """Add and update driver_name field in rides_ride table."""
    try:
        conn = connections['default'].connection
        cur = conn.cursor()
        
        # Check if driver_name column exists
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'rides_ride' AND column_name = 'driver_name';
        """)
        
        has_column = bool(cur.fetchone())
        
        if not has_column:
            print("Adding driver_name column to rides_ride table...")
            # Add the column if it doesn't exist
            cur.execute("""
                ALTER TABLE rides_ride 
                ADD COLUMN driver_name VARCHAR(255);
            """)
            conn.commit()
            print("Column added successfully.")
        else:
            print("driver_name column already exists.")
        
        # Update driver_name values
        print("Updating driver names...")
        cur.execute("""
            UPDATE rides_ride r
            SET driver_name = u.first_name || ' ' || u.last_name
            FROM users_user u
            WHERE r.driver_id = u.id AND (r.driver_name IS NULL OR r.driver_name = '');
        """)
        
        rows_updated = cur.rowcount
        conn.commit()
        print(f"Updated {rows_updated} rows.")
        
        # Get current data stats
        cur.execute("""
            SELECT 
                COUNT(*) as total_rides,
                COUNT(driver_name) as rides_with_driver_name
            FROM rides_ride;
        """)
        stats = cur.fetchone()
        print(f"Stats: {stats[0]} total rides, {stats[1]} rides with driver_name.")
        
        # Sample data
        cur.execute("""
            SELECT id, driver_id, driver_name
            FROM rides_ride
            LIMIT 5;
        """)
        sample_data = cur.fetchall()
        print("\nSample data:")
        for row in sample_data:
            print(f"ID: {row[0]}, Driver ID: {row[1]}, Driver Name: {row[2]}")
        
        cur.close()
        print("\nDone!")
        return True
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return False

if __name__ == "__main__":
    print("Starting driver_name update process...")
    update_driver_names() 