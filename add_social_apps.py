import os
import django
import sys

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'carpool_project.settings')
django.setup()

from allauth.socialaccount.models import SocialApp
from django.contrib.sites.models import Site
from django.conf import settings

def create_social_apps():
    """
    Create social application entries in the database
    """
    print("Creating social applications...")
    
    # Get the default site
    site = Site.objects.get_or_create(id=settings.SITE_ID)[0]
    site.domain = "localhost:8000"
    site.name = "RideX Application"
    site.save()
    
    # Create Google app
    google_client_id = os.environ.get('GOOGLE_CLIENT_ID', '')
    google_secret = os.environ.get('GOOGLE_CLIENT_SECRET', '')
    
    if google_client_id and google_secret:
        google_app, created = SocialApp.objects.get_or_create(
            provider='google',
            defaults={
                'name': 'Google',
                'client_id': google_client_id,
                'secret': google_secret
            }
        )
        
        if not created:
            google_app.client_id = google_client_id
            google_app.secret = google_secret
            google_app.save()
            
        google_app.sites.add(site)
        print("Google app configured.")
    else:
        print("Skipping Google app configuration (missing credentials).")
    
    # Create Facebook app
    facebook_client_id = os.environ.get('FACEBOOK_CLIENT_ID', '')
    facebook_secret = os.environ.get('FACEBOOK_CLIENT_SECRET', '')
    
    if facebook_client_id and facebook_secret:
        facebook_app, created = SocialApp.objects.get_or_create(
            provider='facebook',
            defaults={
                'name': 'Facebook',
                'client_id': facebook_client_id,
                'secret': facebook_secret
            }
        )
        
        if not created:
            facebook_app.client_id = facebook_client_id
            facebook_app.secret = facebook_secret
            facebook_app.save()
            
        facebook_app.sites.add(site)
        print("Facebook app configured.")
    else:
        print("Skipping Facebook app configuration (missing credentials).")
    
    # Create GitHub app
    github_client_id = os.environ.get('GITHUB_CLIENT_ID', '')
    github_secret = os.environ.get('GITHUB_CLIENT_SECRET', '')
    
    if github_client_id and github_secret:
        github_app, created = SocialApp.objects.get_or_create(
            provider='github',
            defaults={
                'name': 'GitHub',
                'client_id': github_client_id,
                'secret': github_secret
            }
        )
        
        if not created:
            github_app.client_id = github_client_id
            github_app.secret = github_secret
            github_app.save()
            
        github_app.sites.add(site)
        print("GitHub app configured.")
    else:
        print("Skipping GitHub app configuration (missing credentials).")

if __name__ == '__main__':
    create_social_apps()
    print("Social apps setup complete!") 