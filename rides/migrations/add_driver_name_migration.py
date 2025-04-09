from django.db import migrations

def forward_func(apps, schema_editor):
    # Do nothing - we've reverted to a previous design without this field
    pass

def reverse_func(apps, schema_editor):
    # Do nothing - we've reverted to a previous design without this field
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('rides', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(forward_func, reverse_func),
    ] 