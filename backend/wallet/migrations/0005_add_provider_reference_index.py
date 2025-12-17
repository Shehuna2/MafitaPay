# Generated migration for adding index on provider_reference field

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('wallet', '0004_alter_wallettransaction_category'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='deposit',
            index=models.Index(fields=['provider_reference'], name='wallet_depo_provide_idx'),
        ),
    ]
