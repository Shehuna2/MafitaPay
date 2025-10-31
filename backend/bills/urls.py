# bills/urls.py
from django.urls import path
from .views import (
    BuyAirtimeView, BuyDataView, DataPlansView,
    BuyCableTVView, BuyElectricityView, BuyEducationView, BillVariationsView
)

urlpatterns = [
    path("api/bills/airtime/", BuyAirtimeView.as_view(), name="buy-airtime"),
    path("api/bills/data/", BuyDataView.as_view(), name="buy-data"),
    path("api/bills/data-plans/", DataPlansView.as_view(), name="data-plans"),
    
    path("api/bills/cable-tv/", BuyCableTVView.as_view(), name="buy-cable-tv"),
    path("api/bills/electricity/", BuyElectricityView.as_view(), name="buy-electricity"),
    path("api/bills/education/", BuyEducationView.as_view(), name="buy-education"),
    path("api/bills/variations/", BillVariationsView.as_view(), name="bill-variations"),
]