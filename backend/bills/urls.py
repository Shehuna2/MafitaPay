from django.urls import path
from .views import BuyAirtimeView, BuyDataView, DataPlansView

urlpatterns = [
    path("api/bills/airtime/", BuyAirtimeView.as_view(), name="buy-airtime"),
    path("api/bills/data/", BuyDataView.as_view(), name="buy-data"),
    path("api/bills/data-plans/", DataPlansView.as_view(), name="data-plans"),
]