from django.urls import path
from .views import (
    WalletView, WalletTransactionListView, NotificationListView, NotificationMarkReadView,
    GenerateDVAAPIView, RequeryDVAAPIView,
    SecureWithdrawalView, SecurePaymentView  # New secure transaction views
)
from .webhooks import paystack_webhook, psb_webhook, flutterwave_webhook, palmpay_webhook

urlpatterns = [
    path("wallet/", WalletView.as_view(), name="wallet"),

    path('wallet/dva/generate/', GenerateDVAAPIView.as_view(), name='generate-dva'),
    path('wallet/dva/requery/', RequeryDVAAPIView.as_view(), name='requery-dva'),
    
    path("9psb/webhook/", psb_webhook, name="9psb-webhook"),
    path("paystack/webhook/", paystack_webhook, name="paystack_webhook"),
    # path("flutterwave/webhook/", flutterwave_webhook, name="flutterwave_webhook"),
    path('api/wallet/flutterwave-webhook/', flutterwave_webhook, name='flutterwave-webhook'),
    path('api/wallet/palmpay-webhook/', palmpay_webhook, name='palmpay-webhook'),
    

    path("api/wallet/transactions/", WalletTransactionListView.as_view(), name="wallet-transactions"),

    path("notifications/", NotificationListView.as_view(), name="notifications-list"),
    path("notifications/mark-read/", NotificationMarkReadView.as_view(), name="notifications-mark-read"),

    path("api/wallet/generate-dva/", GenerateDVAAPIView.as_view(), name="generate-dva"),
    path("api/wallet/requery-dva/", RequeryDVAAPIView.as_view(), name="requery-dva"),

    # Secure transaction endpoints with PIN/biometric verification
    path("api/wallet/withdraw/", SecureWithdrawalView.as_view(), name="secure-withdrawal"),
    path("api/wallet/payment/", SecurePaymentView.as_view(), name="secure-payment"),

]
