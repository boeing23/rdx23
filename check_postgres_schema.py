#!/usr/bin/env python
"""
Script to check PostgreSQL schema and verify migration status.
Run this with: railway run python check_postgres_schema.py
"""

import os
import sys
import django
import json
from datetime import datetime

# Set up Django environment with production settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'carpool_project.settings_production')
django.setup()

from django.db import connection, connections
from django.db.migrations.recorder import MigrationRecorder
from django.core.management import call_command
from django.conf import settings

def print_header(text):
    """Print a formatted header"""
    print("\n" + "=" * 50)
    print(f" {text}")
    print("=" * 50)

def check_postgres_connection():
    """Check if we can connect to PostgreSQL"""
    print_header("DATABASE CONNECTION CHECK")
    
    # Get database settings
    db_settings = connection.settings_dict
    print(f"ENGINE: {db_settings['ENGINE']}")
    print(f"NAME: {db_settings['NAME']}")
    print(f"HOST: {db_settings['HOST']}")
    print(f"PORT: {db_settings['PORT']}")
    
    # Try to establish connection
    try:
        connection.ensure_connection()
        print("✅ Database connection successful!")
        return True
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False

def check_migrations():
    """Check migration status"""
    print_header("MIGRATION STATUS")
    
    try:
        # Get all migrations from Django's migration records
        recorder = MigrationRecorder(connection)
        applied_migrations = recorder.applied_migrations()
        
        # Group migrations by app
        migrations_by_app = {}
        for app_name, migration_name in applied_migrations:
            if app_name not in migrations_by_app:
                migrations_by_app[app_name] = []
            migrations_by_app[app_name].append(migration_name)
        
        # Print migration status
        for app, migrations in migrations_by_app.items():
            print(f"\n{app}:")
            for migration in sorted(migrations):
                print(f"  [X] {migration}")
        
        # Check specifically for our rides migrations
        rides_migrations = migrations_by_app.get('rides', [])
        print("\nChecking critical rides migrations:")
        critical_migrations = [
            '0003_add_proposed_ride_field',
            '0004_add_driver_name_column',
            '0005_merge_20250408_1726',
            '0006_merge_drivers', 
            '0007_add_missing_fields'
        ]
        
        for migration in critical_migrations:
            if migration in rides_migrations:
                print(f"  ✅ {migration} - Applied")
            else:
                print(f"  ❌ {migration} - Not Applied")
        
        return True
    except Exception as e:
        print(f"Error checking migrations: {e}")
        return False

def check_tables():
    """Check database tables and structure"""
    print_header("DATABASE TABLES CHECK")
    
    try:
        with connection.cursor() as cursor:
            # Get all tables
            tables = connection.introspection.table_names(cursor)
            print(f"Found {len(tables)} tables:")
            for table in sorted(tables):
                print(f"- {table}")
            
            # Check if ride table exists
            if 'rides_ride' in tables:
                print("\n✅ rides_ride table exists")
                
                # Get columns for rides_ride table
                columns_info = connection.introspection.get_table_description(cursor, 'rides_ride')
                print("\nColumns in rides_ride table:")
                
                for column in columns_info:
                    column_name = column.name
                    print(f"- {column_name}")
                
                # Check if driver_name column exists
                driver_name_exists = any(column.name == 'driver_name' for column in columns_info)
                if driver_name_exists:
                    print("\n⚠️ driver_name column still exists in rides_ride")
                else:
                    print("\n✅ driver_name column has been removed from rides_ride")
                
                # Check for route_geometry and other required fields
                required_fields = ['route_geometry', 'route_duration', 'route_distance']
                for field in required_fields:
                    exists = any(column.name == field for column in columns_info)
                    if exists:
                        print(f"✅ {field} column exists in rides_ride")
                    else:
                        print(f"❌ {field} column is missing in rides_ride")
            else:
                print("❌ rides_ride table does not exist")
                
        return True
    except Exception as e:
        print(f"Error checking tables: {e}")
        return False

def check_ride_data():
    """Check sample ride data"""
    print_header("SAMPLE RIDE DATA CHECK")
    
    try:
        with connection.cursor() as cursor:
            # Get ride count
            cursor.execute("SELECT COUNT(*) FROM rides_ride")
            ride_count = cursor.fetchone()[0]
            print(f"Total rides: {ride_count}")
            
            if ride_count > 0:
                # Get sample ride
                cursor.execute("""
                    SELECT id, driver_id, start_location, end_location, 
                           departure_time, available_seats, status
                    FROM rides_ride
                    LIMIT 1
                """)
                ride = cursor.fetchone()
                
                print("\nSample Ride:")
                print(f"ID: {ride[0]}")
                print(f"Driver ID: {ride[1]}")
                print(f"Start location: {ride[2]}")
                print(f"End location: {ride[3]}")
                print(f"Departure time: {ride[4]}")
                print(f"Available seats: {ride[5]}")
                print(f"Status: {ride[6]}")
                
                # Try to access driver_name (this should fail if column is removed)
                try:
                    cursor.execute("SELECT driver_name FROM rides_ride WHERE id = %s", [ride[0]])
                    driver_name = cursor.fetchone()
                    print(f"driver_name value: {driver_name}")
                    print("❌ driver_name column still accessible")
                except Exception as e:
                    print("✅ driver_name column not accessible (as expected)")
            else:
                print("No ride data available for checking")
                
        return True
    except Exception as e:
        print(f"Error checking ride data: {e}")
        return False

if __name__ == "__main__":
    print(f"Starting PostgreSQL schema check at {datetime.now()}")
    print(f"Django version: {django.get_version()}")
    print(f"Settings module: {settings.SETTINGS_MODULE}")
    
    # Run all checks
    connection_ok = check_postgres_connection()
    if connection_ok:
        migrations_ok = check_migrations()
        tables_ok = check_tables()
        data_ok = check_ride_data()
        
        # Summary
        print_header("SUMMARY")
        print(f"Connection check: {'✅ PASS' if connection_ok else '❌ FAIL'}")
        print(f"Migrations check: {'✅ PASS' if migrations_ok else '❌ FAIL'}")
        print(f"Tables check: {'✅ PASS' if tables_ok else '❌ FAIL'}")
        print(f"Data check: {'✅ PASS' if data_ok else '❌ FAIL'}")
        
        print("\nRecommendation:")
        if all([connection_ok, migrations_ok, tables_ok, data_ok]):
            print("✅ Database schema looks good! The application should work properly.")
        else:
            print("⚠️ There are some issues with the database schema.")
            print("   Consider running migrations again: railway run python manage.py migrate")
    else:
        print("\n❌ Cannot proceed with checks due to database connection failure.")
        print("   Please check your DATABASE_URL in Railway environment variables.") 