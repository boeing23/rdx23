import os
import sys
import pprint

print("=" * 50)
print("PYTHON VERSION:", sys.version)
print("=" * 50)
print("ENVIRONMENT VARIABLES:")
for key, value in os.environ.items():
    if key.lower() not in ('secret_key', 'password', 'email_host_password'):
        print(f"{key}={value}")
    else:
        print(f"{key}=[REDACTED]")
print("=" * 50)

try:
    import dj_database_url
    print("dj_database_url imported successfully")
    
    if 'DATABASE_URL' in os.environ:
        db_config = dj_database_url.config()
        # Don't print PASSWORD
        if 'PASSWORD' in db_config:
            db_config['PASSWORD'] = '[REDACTED]'
        print("Database config:")
        pprint.pprint(db_config)
    else:
        print("DATABASE_URL not in environment")
except Exception as e:
    print(f"Error importing dj_database_url: {e}")

try:
    import django
    print(f"Django version: {django.get_version()}")
except Exception as e:
    print(f"Error importing Django: {e}")

print("=" * 50)
print("DIAGNOSIS COMPLETE") 