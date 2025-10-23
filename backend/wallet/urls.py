from django.urls import path
from .views import WalletView, WalletTransactionListView, NotificationListView, NotificationMarkReadView 

# from .api_views import PalmPayWebhookAPI, WalletBonusView

urlpatterns = [
    path("wallet/", WalletView.as_view(), name="wallet"),
    path("api/wallet/transactions/", WalletTransactionListView.as_view(), name="wallet-transactions"),

    path("notifications/", NotificationListView.as_view(), name="notifications-list"),
    path("notifications/mark-read/", NotificationMarkReadView.as_view(), name="notifications-mark-read"),
    # path("api/wallet/bonus/", WalletBonusView.as_view(), name="wallet-bonus"),
    # path("api/palmpay/webhook/", PalmPayWebhookAPI.as_view(), name="palmpay_webhook"),
]
