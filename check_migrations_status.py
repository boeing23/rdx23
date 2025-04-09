#!/usr/bin/env python
"""
Script to check migration status in Railway.
Run with: railway run python check_migrations_status.py
"""

import os
import sys
import django
import logging
from django.db.migrations.recorder import MigrationRecorder

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger('check_migrations')

def check_database_tables():
    """Check if database tables exist"""
    try:
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
            tables = cursor.fetchall()
            
            if not tables:
                logger.error("No tables found in the database!")
                return False
                
            logger.info(f"Found {len(tables)} tables:")
            for table in tables:
                logger.info(f"- {table[0]}")
                
            # Check for essential tables
            table_names = [t[0] for t in tables]
            essential_tables = [
                'auth_user', 
                'users_user', 
                'rides_ride', 
                'rides_riderequest',
                'django_migrations'
            ]
            
            missing_tables = [t for t in essential_tables if t not in table_names]
            if missing_tables:
                logger.error(f"Missing essential tables: {missing_tables}")
                return False
                
            return True
    except Exception as e:
        logger.error(f"Error checking tables: {e}")
        return False

def check_migrations_status():
    """Check migration status"""
    try:
        # Get all migrations from Django's migration records
        from django.db import connection
        recorder = MigrationRecorder(connection)
        applied_migrations = recorder.applied_migrations()
        
        if not applied_migrations:
            logger.error("No migrations have been applied!")
            return False
            
        # Group migrations by app
        migrations_by_app = {}
        for app_name, migration_name in applied_migrations:
            if app_name not in migrations_by_app:
                migrations_by_app[app_name] = []
            migrations_by_app[app_name].append(migration_name)
        
        # Print migration status
        logger.info("Applied migrations:")
        for app, migrations in migrations_by_app.items():
            logger.info(f"\n{app}:")
            for migration in sorted(migrations):
                logger.info(f"  [X] {migration}")
                
        # Check if initial migrations for key apps are applied
        key_apps = ['auth', 'users', 'rides']
        missing_apps = [app for app in key_apps if app not in migrations_by_app]
        if missing_apps:
            logger.error(f"Missing migrations for apps: {missing_apps}")
            return False
            
        return True
    except Exception as e:
        logger.error(f"Error checking migrations: {e}")
        return False

def force_migrations():
    """Force-apply migrations"""
    try:
        logger.info("Attempting to force-apply migrations...")
        from django.core.management import call_command
        
        # Run migrate with fake-initial first
        logger.info("Running migrate with --fake-initial...")
        call_command('migrate', fake_initial=True)
        
        # Then run normal migrate to catch any remaining migrations
        logger.info("Running regular migrate...")
        call_command('migrate')
        
        return True
    except Exception as e:
        logger.error(f"Error forcing migrations: {e}")
        return False

if __name__ == "__main__":
    # Setup Django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'carpool_project.settings_production')
    logger.info(f"Using settings module: {os.environ['DJANGO_SETTINGS_MODULE']}")
    django.setup()
    
    # Check database connection first
    try:
        from django.db import connections
        connections['default'].ensure_connection()
        logger.info("✅ Database connection successful!")
        
        db_settings = connections['default'].settings_dict
        logger.info(f"Connected to: {db_settings.get('ENGINE')}")
        logger.info(f"Database: {db_settings.get('NAME')}")
        logger.info(f"Host: {db_settings.get('HOST')}")
    except Exception as e:
        logger.error(f"❌ Database connection failed: {e}")
        sys.exit(1)
    
    # Check tables
    tables_exist = check_database_tables()
    
    # Check migrations
    migrations_ok = check_migrations_status()
    
    # If tables don't exist or migrations aren't ok, force migrations
    if not tables_exist or not migrations_ok:
        logger.info("Issues detected with migrations or tables. Attempting to force migrations...")
        force_migrations()
        
        # Check again
        tables_exist = check_database_tables()
        migrations_ok = check_migrations_status()
    
    # Summary
    logger.info("\n=== SUMMARY ===")
    logger.info(f"Tables exist: {'✅ YES' if tables_exist else '❌ NO'}")
    logger.info(f"Migrations applied: {'✅ YES' if migrations_ok else '❌ NO'}")
    
    if not tables_exist or not migrations_ok:
        logger.error("Database is not properly set up!")
        sys.exit(1)
    else:
        logger.info("✅ Database is properly set up!")
        sys.exit(0) 