from decimal import Decimal

from django.db import migrations, models


SUPPORTED_CARD_CURRENCIES = [
    ("EUR", "Euro"),
    ("USD", "US Dollar"),
    ("GBP", "British Pound"),
    ("GHS", "Ghana Cedi"),
    ("XOF", "West African CFA Franc"),
    ("XAF", "Central African CFA Franc"),
]


def seed_exchange_rates(apps, schema_editor):
    CardDepositExchangeRate = apps.get_model("wallet", "CardDepositExchangeRate")
    for currency, _ in SUPPORTED_CARD_CURRENCIES:
        CardDepositExchangeRate.objects.get_or_create(
            currency=currency,
            defaults={
                "rate": Decimal("1.00"),
                "flutterwave_fee_percent": Decimal("1.40"),
                "platform_margin_percent": Decimal("0.50"),
            },
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("wallet", "0010_carddeposit_provider"),
    ]

    operations = [
        migrations.AlterField(
            model_name="carddepositexchangerate",
            name="currency",
            field=models.CharField(
                choices=SUPPORTED_CARD_CURRENCIES,
                max_length=3,
                unique=True,
            ),
        ),
        migrations.AlterField(
            model_name="carddeposit",
            name="currency",
            field=models.CharField(
                choices=SUPPORTED_CARD_CURRENCIES,
                max_length=3,
            ),
        ),
        migrations.RunPython(seed_exchange_rates, reverse_code=noop_reverse),
    ]
