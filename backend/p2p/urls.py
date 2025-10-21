from django.urls import path
# from . import views
from .views import (
    DepositOfferListCreateAPIView, DepositOrderDetailAPIView, CreateDepositOrderAPIView,
    MyDepositOrdersAPIView, MerchantDepositOrdersAPIView, ConfirmDepositOrderAPIView,
    CancelDepositOrderAPIView, MarkDepositOrderPaidAPIView, 

    WithdrawOfferListCreateAPIView, CreateWithdrawOrderAPIView, WithdrawOrderDetailAPIView,
    MarkWithdrawOrderPaidAPIView, MyWithdrawOrdersAPIView, MerchantWithdrawOrdersAPIView,
    ConfirmWithdrawOrderAPIView, CancelWithdrawOrderAPIView
)

urlpatterns = [
    path("api/p2p/offers/", DepositOfferListCreateAPIView.as_view(), name="p2p-offers"),
    path("api/p2p/offers/<int:offer_id>/create-order/", CreateDepositOrderAPIView.as_view(), name="p2p-create-order"),
    path("api/p2p/orders/<int:id>/", DepositOrderDetailAPIView.as_view(), name="order-detail"),
    path("api/p2p/orders/<int:order_id>/mark-paid/", MarkDepositOrderPaidAPIView.as_view(), name="mark-order-paid"),
    path("api/p2p/my-orders/", MyDepositOrdersAPIView.as_view(), name="p2p-my-orders"),
    path("api/p2p/merchant-orders/", MerchantDepositOrdersAPIView.as_view(), name="p2p-merchant-orders"),
    path("api/p2p/orders/<int:order_id>/confirm/", ConfirmDepositOrderAPIView.as_view(), name="p2p-confirm-order"),
    path("api/p2p/orders/<int:order_id>/cancel/", CancelDepositOrderAPIView.as_view(), name="p2p-cancel-order"),


    # withdraw path
    path("api/p2p/withdraw-offers/", WithdrawOfferListCreateAPIView.as_view(), name="p2p-withdraw-offers"),
    path("api/p2p/withdraw-offers/<int:offer_id>/create-order/", CreateWithdrawOrderAPIView.as_view(), name="p2p-withdraw-create-order"),
    path("api/p2p/withdraw-orders/<int:id>/", WithdrawOrderDetailAPIView.as_view(), name="withdraw-order-detail"),
    path("api/p2p/withdraw-orders/<int:order_id>/mark-paid/", MarkWithdrawOrderPaidAPIView.as_view(), name="p2p-withdraw-mark-paid"),
    path("api/p2p/my-withdraw-orders/", MyWithdrawOrdersAPIView.as_view(), name="p2p-my-withdraw-orders"),
    path("api/p2p/merchant-withdraw-orders/", MerchantWithdrawOrdersAPIView.as_view(), name="p2p-merchant-withdraw-orders"),
    path("api/p2p/withdraw-orders/<int:order_id>/confirm/", ConfirmWithdrawOrderAPIView.as_view(), name="p2p-withdraw-confirm-order"),
    path("api/p2p/withdraw-orders/<int:order_id>/cancel/", CancelWithdrawOrderAPIView.as_view(), name="p2p-withdraw-cancel-order"),
]