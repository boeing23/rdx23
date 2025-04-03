from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('rides', '0010_auto_20250402_1433'),
    ]

    operations = [
        migrations.AddField(
            model_name='riderequest',
            name='optimal_pickup_point',
            field=models.JSONField(blank=True, help_text='Information about the optimal pickup point along driver\'s route', null=True),
        ),
    ] 