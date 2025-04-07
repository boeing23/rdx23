from django.core.management.base import BaseCommand
from rides.views import fix_notification_field_names

class Command(BaseCommand):
    help = 'Fixes notification field names by migrating user field to recipient field'

    def handle(self, *args, **options):
        self.stdout.write('Starting notification field fix...')
        fix_notification_field_names()
        self.stdout.write(self.style.SUCCESS('Successfully completed notification field fix')) 