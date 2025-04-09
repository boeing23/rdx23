from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('rides', '0006_merge_drivers'),
    ]

    operations = [
        migrations.AddField(
            model_name='ride',
            name='route_geometry',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='ride',
            name='route_duration',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='ride',
            name='route_distance',
            field=models.FloatField(blank=True, null=True),
        ),
    ] 