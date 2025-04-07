import os
import sys
import django
from django.db import connection

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'carpool_project.settings')
django.setup()

# Print database connection information
print("Database engine:", connection.settings_dict['ENGINE'])
print("Database name:", connection.settings_dict['NAME'])
print("Database host:", connection.settings_dict['HOST'])
print("Database port:", connection.settings_dict['PORT'])

# List all tables
print("\nDatabase tables:")
with connection.cursor() as cursor:
    tables = connection.introspection.table_names(cursor)
    for table in tables:
        print(f"- {table}")

# Show sample data from Ride and RideRequest tables
print("\nSample Ride data:")
with connection.cursor() as cursor:
    cursor.execute("SELECT id, driver_id, start_location, end_location, status FROM rides_ride LIMIT 5")
    rides = cursor.fetchall()
    for ride in rides:
        print(f"ID: {ride[0]}, Driver: {ride[1]}, From: {ride[2]}, To: {ride[3]}, Status: {ride[4]}")

print("\nSample RideRequest data:")
with connection.cursor() as cursor:
    cursor.execute("SELECT id, rider_id, ride_id, status, pickup_location, dropoff_location FROM rides_riderequest LIMIT 5")
    requests = cursor.fetchall()
    for req in requests:
        print(f"ID: {req[0]}, Rider: {req[1]}, Ride: {req[2]}, Status: {req[3]}, Pickup: {req[4]}, Dropoff: {req[5]}")

print("\nOptimal pickup points and nearest dropoff points:")
with connection.cursor() as cursor:
    cursor.execute("SELECT id, nearest_dropoff_point, optimal_pickup_point FROM rides_riderequest WHERE nearest_dropoff_point IS NOT NULL OR optimal_pickup_point IS NOT NULL LIMIT 5")
    points = cursor.fetchall()
    for point in points:
        print(f"RideRequest ID: {point[0]}")
        print(f"  Nearest dropoff: {point[1]}")
        print(f"  Optimal pickup: {point[2]}") 