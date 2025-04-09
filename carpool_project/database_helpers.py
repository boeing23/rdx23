"""
Database connection helper utilities
"""
import os
import sys
import socket
import logging
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

def check_postgres_hostname():
    """
    Check the PostgreSQL hostname and try to resolve it
    """
    if 'DATABASE_URL' not in os.environ:
        print("DATABASE_URL not found in environment", file=sys.stderr)
        return None
    
    try:
        db_url = os.environ['DATABASE_URL']
        parsed = urlparse(db_url)
        hostname = parsed.hostname
        
        if not hostname:
            print("No hostname found in DATABASE_URL", file=sys.stderr)
            return None
        
        # Try to resolve the hostname
        try:
            ip_address = socket.gethostbyname(hostname)
            print(f"Successfully resolved {hostname} to {ip_address}", file=sys.stderr)
            return ip_address
        except socket.gaierror as e:
            print(f"Failed to resolve hostname {hostname}: {e}", file=sys.stderr)
            
            # Special case for postgres.railway.internal
            if hostname == 'postgres.railway.internal':
                # Hard-coded fallback IPs for Railway PostgreSQL
                railway_ips = ['100.64.0.10', '100.64.1.10', '100.64.2.10']
                print(f"Using fallback IPs for postgres.railway.internal: {railway_ips}", file=sys.stderr)
                return railway_ips
            
            return None
    except Exception as e:
        print(f"Error parsing DATABASE_URL: {e}", file=sys.stderr)
        return None

def get_connection_params():
    """
    Return connection parameters for PostgreSQL based on environment
    """
    params = {
        'connect_timeout': 15,         # 15 seconds timeout
        'keepalives': 1,               # Enable keepalives
        'keepalives_idle': 30,         # 30 seconds idle time
        'keepalives_interval': 10,     # 10 seconds interval
        'keepalives_count': 5,         # 5 attempts
        'application_name': 'railway_app'  # Identify our app
    }
    
    # Check if using Railway
    if os.environ.get('RAILWAY_ENVIRONMENT'):
        print("Adding Railway-specific connection params", file=sys.stderr)
        params.update({
            'sslmode': 'prefer',           # Try SSL, fall back to non-SSL
            'target_session_attrs': 'read-write',  # Ensure we can write
        })
        
        # Get hostname IP
        postgres_ip = check_postgres_hostname()
        if postgres_ip:
            if isinstance(postgres_ip, list):
                # If we got a list of IPs, add them as hostaddr options
                for i, ip in enumerate(postgres_ip):
                    params[f'hostaddr{i+1}'] = ip
            else:
                # Single IP - use as primary hostaddr
                params['hostaddr'] = postgres_ip
    
    return params

def update_database_settings(databases_dict):
    """
    Update the database settings dictionary with improved parameters
    """
    print("Applying enhanced PostgreSQL connection parameters", file=sys.stderr)
    
    for db_alias, db_settings in databases_dict.items():
        if db_settings.get('ENGINE') == 'django.db.backends.postgresql':
            # Update connection parameters
            db_settings.setdefault('OPTIONS', {})
            db_settings['OPTIONS'].update(get_connection_params())
            
            # Set higher timeouts
            db_settings['CONN_MAX_AGE'] = 600  # 10 minutes
            db_settings['CONN_HEALTH_CHECKS'] = True
            
            print(f"Enhanced settings applied to database '{db_alias}'", file=sys.stderr)
    
    return databases_dict 