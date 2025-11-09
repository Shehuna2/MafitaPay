from django.urls import path
from . import views 
from .views import (
    AssetListAPI, BuyCryptoAPI, StartSellOrderAPI, UploadPaymentProofAPI, SellOrderStatusAPI,
    ExchangeListAPI, ExchangeRateAPI, SellOrderUpdateAPI, PendingSellOrdersAPI, CancelSellOrderAPI,
    AdminSellOrdersAPI, AdminUpdateSellOrderAPI, ExchangeInfoAPI
)


urlpatterns = [
    # React-buy views
    path("api/assets/", AssetListAPI.as_view(), name="assets-api"),
    path("api/buy-crypto/<int:crypto_id>/", BuyCryptoAPI.as_view(), name="buy-crypto-api"),

    # React-sell views
    path("api/sell/exchanges/", ExchangeListAPI.as_view(), name="sell-exchanges"),
    path("api/sell/exchange-info/", ExchangeInfoAPI.as_view(), name="sell-exchange-info"),  # ✅ FIXED: add this line
    path("api/rate/<str:asset>/", ExchangeRateAPI.as_view(), name="exchange-rate"),
    path("api/sell/", StartSellOrderAPI.as_view(), name="start-sell-order"),

    path("api/sell/<uuid:order_id>/upload-proof/", UploadPaymentProofAPI.as_view(), name="upload-sell-proof"),
    path("api/sell/<uuid:order_id>/", SellOrderStatusAPI.as_view(), name="sell-order-status"),
    path("api/sell/<uuid:order_id>/", SellOrderUpdateAPI.as_view(), name="update-sell-order"),
    path("api/sell/pending/", PendingSellOrdersAPI.as_view(), name="sell-pending"),
    path("api/sell/<uuid:order_id>/cancel/", CancelSellOrderAPI.as_view(), name="sell-cancel"),
    path("api/sell/<uuid:order_id>/status/", SellOrderStatusAPI.as_view(), name="sell-order-status"),

    path("api/admin/sell-orders/", AdminSellOrdersAPI.as_view(), name="admin-sell-orders"),
    path("api/admin/sell-orders/<uuid:order_id>/update/", AdminUpdateSellOrderAPI.as_view(), name="admin-update-sell-order"),
]
   