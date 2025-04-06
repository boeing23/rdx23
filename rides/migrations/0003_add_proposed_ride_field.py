# Generated manually

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('rides', '0002_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='pendingriderequest',
            name='status',
            field=models.CharField(choices=[('PENDING', 'Pending'), ('MATCH_PROPOSED', 'Match Proposed'), ('MATCHED', 'Matched'), ('REJECTED', 'Rejected'), ('EXPIRED', 'Expired'), ('CANCELLED', 'Cancelled')], default='PENDING', max_length=15),
        ),
        migrations.AddField(
            model_name='pendingriderequest',
            name='proposed_ride',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='proposed_matches', to='rides.ride'),
        ),
    ] 