import os
import sys
import django
import json
from django.db import connection
from datetime import datetime
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

# Add this to urls.py:
# from django.urls import path
# from .railway_status import status_check
# urlpatterns = [
#     ...
#     path('railway-status/', status_check, name='railway_status'),
# ]

@csrf_exempt
def status_check(request):
    """
    Endpoint to check application and database status.
    Always returns 200 for health checks, even if there are issues.
    """
    try:
        status_data = {
            "application": {
                "status": "running",
                "timestamp": datetime.now().isoformat(),
                "environment": os.environ.get("ENVIRONMENT", "production")
            },
            "database": check_database_status(),
        }
    except Exception as e:
        # For health checks, we still want to return 200
        status_data = {
            "application": {
                "status": "running",
                "timestamp": datetime.now().isoformat(),
                "error": str(e)
            }
        }
    
    # Always return 200 for health checks
    return JsonResponse(status_data, status=200)

def check_database_status():
    """Check database connection and return status data"""
    result = {
        "connection": "failed",
        "details": {},
        "tables": {},
        "error": None
    }
    
    try:
        # Get connection info (without sensitive details)
        db_settings = connection.settings_dict
        result["details"] = {
            "engine": db_settings['ENGINE'],
            "name": db_settings['NAME'],
            "host": db_settings['HOST'],
            "port": db_settings['PORT'],
        }
        
        # Test connection
        connection.ensure_connection()
        result["connection"] = "success"
        
        # Get table counts
        with connection.cursor() as cursor:
            tables = connection.introspection.table_names(cursor)
            result["tables"]["count"] = len(tables)
            result["tables"]["list"] = tables
            
            # Get record counts for key tables
            table_counts = {}
            for table in ["rides_ride", "rides_riderequest", "users_user"]:
                if table in tables:
                    cursor.execute(f"SELECT COUNT(*) FROM {table}")
                    table_counts[table] = cursor.fetchone()[0]
            
            result["tables"]["records"] = table_counts
            
            # Check for optimal pickup points
            if "rides_riderequest" in tables:
                cursor.execute("SELECT COUNT(*) FROM rides_riderequest WHERE optimal_pickup_point IS NOT NULL")
                result["tables"]["with_optimal_pickup"] = cursor.fetchone()[0]
                
                cursor.execute("SELECT COUNT(*) FROM rides_riderequest WHERE nearest_dropoff_point IS NOT NULL")
                result["tables"]["with_nearest_dropoff"] = cursor.fetchone()[0]
            
            # Get most recent ride request
            if "rides_riderequest" in tables and table_counts.get("rides_riderequest", 0) > 0:
                cursor.execute("""
                    SELECT id, created_at, status, rider_id, 
                           optimal_pickup_point IS NOT NULL as has_pickup, 
                           nearest_dropoff_point IS NOT NULL as has_dropoff 
                    FROM rides_riderequest 
                    ORDER BY created_at DESC LIMIT 1
                """)
                latest = cursor.fetchone()
                if latest:
                    result["tables"]["latest_request"] = {
                        "id": latest[0],
                        "created_at": latest[1].isoformat() if latest[1] else None,
                        "status": latest[2],
                        "rider_id": latest[3],
                        "has_optimal_pickup": bool(latest[4]),
                        "has_nearest_dropoff": bool(latest[5])
                    }
    except Exception as e:
        result["error"] = str(e)
    
    return result

# If running as script, print status
if __name__ == "__main__":
    # Set up Django environment
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'carpool_project.settings')
    django.setup()
    
    status = check_database_status()
    print(json.dumps(status, indent=2)) 