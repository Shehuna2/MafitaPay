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
    logo = models.ImageField(upload_to='images/', default='default_crypto_logo.png')
    coingecko_id = models.CharField(max_length=50, null=True)
    network = models.CharField(max_length=50, choices=NETWORK_CHOICES) 

    class Meta:
        unique_together = ('coingecko_id', 'network')  # Ensures ETH on Arbitrum/Base are separate

    def save(self, *args, **kwargs):
        if self.network in ['ARB', 'BASE', 'OP']:  # If it's an L2 ETH token
            self.coingecko_id = 'ethereum'  # Ensure correct ID
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.symbol}) on {self.network}"
    
    
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
    currency_pair = models.CharField(max_length=20, default="USDT/NGN", unique=True)
    profit_margin = models.DecimalField(max_digits=10, decimal_places=2, default=0)  # NGN amount to add
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.currency_pair} Margin: ₦{self.profit_margin}"
    

EXCHANGE_CHOICES = [
    ('binance', 'Binance'),
    ('bybit',   'Bybit'),
    ('mexc',    'MEXC'),
    ('gateio',  'Gate.io'),
    ('bitget',  'Bitget'),
    ('wallet',  'External Wallet'),
]

ASSET_CHOICES = [
    ('usdt', 'USDT'),
    ('sidra',  'SIDRA'),
    ('pi',  'PI'),
    ('bnb',  'BNB'),
]


class ExchangeInfo(models.Model):
    exchange = models.CharField(max_length=20, choices=EXCHANGE_CHOICES, unique=True)
    receive_qr = models.ImageField(upload_to='exchange_qrcodes/', blank=True, null=True,)
    contact_info = models.JSONField(blank=True, null=True, default=dict)
    
    def __str__(self):
        return self.get_exchange_display()


class ExchangeRate(models.Model):
    asset = models.CharField(max_length=10, choices=ASSET_CHOICES, unique=True)
    rate_ngn = models.DecimalField(max_digits=20, decimal_places=4)

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"1 {self.asset.upper()} = ₦{self.rate_ngn}"

class AssetSellOrder(models.Model):
    user         = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    order_id     = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)  # ✅ added
    asset        = models.CharField(max_length=10, choices=ASSET_CHOICES)
    source       = models.CharField(max_length=20, choices=EXCHANGE_CHOICES)
    amount_asset = models.DecimalField(max_digits=18, decimal_places=8)
    rate_ngn     = models.DecimalField(max_digits=20, decimal_places=4)   # snapshot of rate
    amount_ngn   = models.DecimalField(max_digits=20, decimal_places=2)   # computed total
    status       = models.CharField(max_length=20, default='pending')
    details      = models.JSONField(blank=True, default=dict)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} → {self.amount_asset} {self.asset.upper()} for ₦{self.amount_ngn}"

class PaymentProof(models.Model):
    order = models.OneToOneField(AssetSellOrder, on_delete=models.CASCADE, related_name="proof")
    image = models.ImageField(upload_to="payment_proofs/")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Proof for Order #{self.order.id}"