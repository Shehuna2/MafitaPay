from django.urls import path
from .views import (
    BonusListView,
    AdminBonusCreateView,
    ClaimBonusView,
)

urlpatterns = [
    path("api/rewards/", BonusListView.as_view(), name="user-bonuses"),
    path("api/rewards/admin/bonuses/create/", AdminBonusCreateView.as_view(), name="admin-create-bonus"),
    path("api/rewards/claim/<int:bonus_id>/", ClaimBonusView.as_view(), name="claim-bonus"),
]