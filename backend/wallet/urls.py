from django.urls import path
from .views import WalletView, WalletTransactionListView    

# from .api_views import PalmPayWebhookAPI, WalletBonusView

urlpatterns = [
    path("wallet/", WalletView.as_view(), name="wallet"),
    path("api/wallet/transactions/", WalletTransactionListView.as_view(), name="wallet-transactions"),
    # path("api/wallet/bonus/", WalletBonusView.as_view(), name="wallet-bonus"),
    # path("api/palmpay/webhook/", PalmPayWebhookAPI.as_view(), name="palmpay_webhook"),
]
