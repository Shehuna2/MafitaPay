from django.urls import path
from .views import (
    WalletView, WalletTransactionListView, NotificationListView, NotificationMarkReadView,
    GenerateDVAAPIView, RequeryDVAAPIView, PaystackDVAWebhookAPIView
)
urlpatterns = [
    path("wallet/", WalletView.as_view(), name="wallet"),

    path('wallet/dva/generate/', GenerateDVAAPIView.as_view(), name='generate-dva'),
    path('wallet/dva/requery/', RequeryDVAAPIView.as_view(), name='requery-dva'),
    path('webhook/paystack-dva/', PaystackDVAWebhookAPIView.as_view(), name='paystack-dva-webhook'),

    path("api/wallet/transactions/", WalletTransactionListView.as_view(), name="wallet-transactions"),

    path("notifications/", NotificationListView.as_view(), name="notifications-list"),
    path("notifications/mark-read/", NotificationMarkReadView.as_view(), name="notifications-mark-read"),

    path("api/wallet/generate-dva/", GenerateDVAAPIView.as_view(), name="generate-dva"),
    path("api/wallet/requery-dva/", RequeryDVAAPIView.as_view(), name="requery-dva"),

]
