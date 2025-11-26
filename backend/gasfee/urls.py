from django.urls import path
from .views import (
    AssetListAPI, BuyCryptoAPI, StartSellOrderAPI, UploadSellOrderProofAPI, SellOrderStatusAPI,
    ExchangeListAPI, ExchangeRateAPI, SellOrderUpdateAPI, PendingSellOrdersAPI, CancelSellOrderAPI,
    AdminSellOrdersAPI, AdminUpdateSellOrderAPI, ExchangeInfoAPI, SellAssetListAPI
)

urlpatterns = [
    # React-buy views
    path("api/assets/", AssetListAPI.as_view(), name="assets-api"),
    path("api/buy-crypto/<int:crypto_id>/", BuyCryptoAPI.as_view(), name="buy-crypto-api"),

    # React-sell 
    path("api/sell/assets/", SellAssetListAPI.as_view(), name="sell-asset-list"),
    path("api/sell/exchanges/", ExchangeListAPI.as_view(), name="sell-exchanges"),
    path("api/sell/exchange-info/", ExchangeInfoAPI.as_view(), name="sell-exchange-info"),
    path("api/sell/rate/<str:asset>/", ExchangeRateAPI.as_view(), name="exchange-rate"),
    path("api/sell/", StartSellOrderAPI.as_view(), name="start-sell-order"),

    # Order-related actions
    path("api/sell/<uuid:order_id>/status/", SellOrderStatusAPI.as_view(), name="sell-order-status"),
    path("api/sell/<uuid:order_id>/update/", SellOrderUpdateAPI.as_view(), name="update-sell-order"),
    path("api/sell/<uuid:order_id>/upload-proof/", UploadSellOrderProofAPI.as_view(), name="upload-sell-proof"),
    path("api/sell/<uuid:order_id>/", SellOrderStatusAPI.as_view(), name="sell-order-detail"),
    path("api/sell/<uuid:order_id>/cancel/", CancelSellOrderAPI.as_view(), name="sell-cancel"),

    # Pending orders
    path("api/sell/pending/", PendingSellOrdersAPI.as_view(), name="sell-pending"),

    # Admin endpoints
    path("api/admin/sell-orders/", AdminSellOrdersAPI.as_view(), name="admin-sell-orders"),
    path("api/admin/sell-orders/<uuid:order_id>/update/", AdminUpdateSellOrderAPI.as_view(), name="admin-update-sell-order"),
]
