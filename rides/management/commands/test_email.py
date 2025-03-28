from django.core.management.base import BaseCommand
from django.core.mail import send_mail
from django.conf import settings
import logging
import smtplib
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Test email configuration with detailed debugging'

    def handle(self, *args, **options):
        # Hardcoded settings for Gmail with SSL
        host = 'smtp.gmail.com'
        port = 465  # SSL port
        use_ssl = True
        user = 'ridex2429@gmail.com'
        password = 'covhotczhrbzvcfy'
        
        self.stdout.write(f"Testing email configuration with hardcoded values...")
        self.stdout.write(f"Email host: {host}")
        self.stdout.write(f"Email port: {port}")
        self.stdout.write(f"Email user: {user}")
        self.stdout.write(f"SSL enabled: {use_ssl}")
        
        try:
            # Try to establish SMTP connection with SSL
            self.stdout.write("Connecting to SMTP server with SSL...")
            smtp = smtplib.SMTP_SSL(host, port)
            smtp.set_debuglevel(1)
            
            self.stdout.write("Attempting login...")
            smtp.login(user, password)
            
            self.stdout.write("Creating test email...")
            msg = MIMEText('This is a test email to verify the email configuration.')
            msg['Subject'] = 'RideX: Email Configuration Test'
            msg['From'] = user
            msg['To'] = user
            
            self.stdout.write("Sending email...")
            smtp.send_message(msg)
            smtp.quit()
            
            self.stdout.write(self.style.SUCCESS('Test email sent successfully'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Failed to send test email: {str(e)}'))
            if hasattr(e, 'smtp_error'):
                self.stdout.write(self.style.ERROR(f'SMTP Error: {e.smtp_error}'))
            raise 