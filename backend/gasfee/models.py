from django.db import models
from django.conf import settings
from django.contrib.auth.models import User
import uuid


class Crypto(models.Model):
    NETWORK_CHOICES = [
        ('ETH', 'Ethereum'),
        ('BNB', 'Binance Smart Chain'),
        ('ARB', 'Arbitrum'),
        ('BASE', 'Base'),
        ('OP', 'Optimism'),
        ('SOL', 'Solana'),
        ('TON', 'The-Open-Network'),
        ('SUI', 'Sui-Network'),
        ('NEAR', 'Near-Protocol'),
        ('POL', 'Polygon'),
        ('AVAX', 'Avalanche'),
        ('TRON', 'Tron'),
        ('XRP', 'XRP Ledger'),
        ('ADA', 'Cardano'),
        ('DOT', 'Polkadot'),
        ('LTC', 'Litecoin'),
        ('DOGE', 'Dogecoin'),
        ('SHIB', 'Shiba Inu'),
        ('MATIC', 'Polygon-MATIC'),
        ('FIL', 'Filecoin'),
    ]

    name = models.CharField(max_length=50)
    symbol = models.CharField(max_length=10, unique=True)
    logo = models.ImageField(upload_to='images/', default='/media/images/Solana_Coin.png')
    coingecko_id = models.CharField(max_length=50, null=True)
    network = models.CharField(max_length=50, choices=NETWORK_CHOICES)

    # Required for price protection system
    last_known_price = models.DecimalField(max_digits=20, decimal_places=8, null=True, blank=True)
    last_price_updated = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('coingecko_id', 'network')

    def save(self, *args, **kwargs):
        if self.network in ['ARB', 'BASE', 'OP']:
            self.coingecko_id = 'ethereum'
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.symbol})[{self.network}]"

    
    
class CryptoPurchase(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    crypto = models.ForeignKey('Crypto', on_delete=models.CASCADE)  # Adjust 'Crypto' to your app’s model name
    input_amount = models.DecimalField(max_digits=20, decimal_places=8)  # Amount user entered
    input_currency = models.CharField(max_length=10)  # NGN, USDT, or crypto symbol
    crypto_amount = models.DecimalField(max_digits=20, decimal_places=8)  # Actual crypto received
    total_price = models.DecimalField(max_digits=20, decimal_places=2)  # Total cost in NGN
    wallet_address = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    request_id = models.CharField(max_length=100, db_index=True, unique=True)
    tx_hash = models.CharField(max_length=255, blank=True, null=True) 
    created_at = models.DateTimeField(auto_now_add=True) 


    def __str__(self):
        return f"{self.user.username} - {self.crypto.symbol} - ₦{self.crypto_amount} - ₦{self.total_price} ({self.status})"


class ExchangeRateMargin(models.Model):
    MARGIN_TYPE_CHOICES = [
        ('buy', 'Buy Margin'),
        ('sell', 'Sell Margin'),
    ]

    currency_pair = models.CharField(max_length=20, default="USDT/NGN")
    margin_type = models.CharField(max_length=10, choices=MARGIN_TYPE_CHOICES, default='buy')
    profit_margin = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('currency_pair', 'margin_type')
        verbose_name = "Exchange Rate Margin"
        verbose_name_plural = "Exchange Rate Margins"

    def clean(self):
        """Ensure profit margin is non-negative."""
        from django.core.exceptions import ValidationError
        if self.profit_margin < 0:
            raise ValidationError("Profit margin cannot be negative.")
        if self.profit_margin > 100000:
            raise ValidationError("Profit margin seems unusually high — please review.")

    def save(self, *args, **kwargs):
        self.full_clean()  # triggers clean() before saving
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.currency_pair} ({self.margin_type}) → ₦{self.profit_margin}"

    

EXCHANGE_CHOICES = [
    ('Binance', 'Binance'),
    ('Bybit',   'Bybit'),
    ('Mexc',    'MEXC'),
    ('Gate.io',  'Gate.io'),
    ('Bitget',  'Bitget'),
    ('Web3 wallet',  'Web3 wallet'),
]

class Asset(models.Model):
    symbol = models.CharField(max_length=10, unique=True)  # e.g. 'usdt'
    name = models.CharField(max_length=50)                 # e.g. 'Tether USD'
    coingecko_id = models.CharField(max_length=50, null=True, blank=True)  # e.g. 'tether'
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name

# class AssetPrice(models.Model):
#     asset = models.OneToOneField('Asset', on_delete=models.CASCADE, related_name='price')
#     price_usd = models.DecimalField(max_digits=20, decimal_places=8, default=1)
#     last_updated = models.DateTimeField(auto_now=True)

#     def __str__(self):
#         return f"{self.asset.symbol.upper()} → ${self.price_usd}"


class AssetSellOrder(models.Model):
    user         = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    order_id     = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)  # ✅ added
    asset        = models.ForeignKey('Asset', on_delete=models.CASCADE)
    source       = models.CharField(max_length=20, choices=EXCHANGE_CHOICES)
    amount_asset = models.DecimalField(max_digits=18, decimal_places=8)
    rate_ngn     = models.DecimalField(max_digits=20, decimal_places=4)   # snapshot of rate
    amount_ngn   = models.DecimalField(max_digits=20, decimal_places=2)   # computed total
    status       = models.CharField(max_length=20, default='pending')
    details      = models.JSONField(blank=True, default=dict)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} → {self.amount_asset} {self.asset} for ₦{self.amount_ngn}"

class PaymentProof(models.Model):
    order = models.OneToOneField(AssetSellOrder, on_delete=models.CASCADE, related_name="proof")
    image = models.ImageField(upload_to="payment_proofs/")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Proof for Order #{self.order.id}"


class TransactionMonitoring(models.Model):
    """
    Model for tracking suspicious transaction patterns and fraud detection.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    event_type = models.CharField(max_length=50)  # e.g., 'rapid_purchase', 'unusual_amount'
    severity = models.CharField(max_length=20, default='low')  # low, medium, high
    description = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed = models.BooleanField(default=False)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='reviewed_transactions'
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['event_type', 'severity']),
            models.Index(fields=['reviewed']),
        ]

    def __str__(self):
        return f"{self.event_type} - {self.user.username} - {self.created_at}"