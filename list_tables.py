import os
import sys
import django
from django.db import connection

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'carpool_project.settings_production')
django.setup()

# Print database connection information
print("Database engine:", connection.settings_dict['ENGINE'])
print("Database name:", connection.settings_dict['NAME'])
print("Database host:", connection.settings_dict['HOST'])
print("Database port:", connection.settings_dict['PORT'])

# List all tables
print("\nDatabase tables:")
tables = connection.introspection.get_table_list(connection.cursor())
for table in tables:
    print(table.name) 