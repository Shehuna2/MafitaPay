# bills/urls.py → FINAL VERSION (2025 Ready)
from django.urls import path
from .views import (
    # Existing
    BuyAirtimeView, BuyDataView, DataPlansView,
    BuyCableTVView, BuyElectricityView, BuyEducationView,

    # NEW 2025 ENDPOINTS
    AirtimeToCashView,         
)

urlpatterns = [
    # ===================================================================
    # CORE VTU ENDPOINTS
    # ===================================================================
    path("api/bills/airtime/", BuyAirtimeView.as_view(), name="buy-airtime"),
    
    # UNIFIED DATA (SME + Gifting + Corporate) — This replaces old BuyDataView
    path("api/bills/data/", BuyDataView.as_view(), name="buy-data"),
    path("api/bills/data/plans/", DataPlansView.as_view(), name="data-plans"),  # GET ?network=mtn&category=SME

    path("api/bills/cable-tv/", BuyCableTVView.as_view(), name="buy-cable-tv"),
    path("api/bills/electricity/", BuyElectricityView.as_view(), name="buy-electricity"),
    path("api/bills/education/", BuyEducationView.as_view(), name="buy-education"),

    # ===================================================================
    # 2025 MUST-HAVE ENDPOINTS
    # ===================================================================
    path("api/bills/airtime-to-cash/", AirtimeToCashView.as_view(), name="airtime-to-cash"),
    
    # Optional: Bulk SMS, Betting Funding, etc. (we'll add later)
    # path("api/bills/bulk-sms/", BulkSMSView.as_view(), name="bulk-sms"),
    # path("api/bills/betting/", BettingFundingView.as_view(), name="betting-funding"),
]