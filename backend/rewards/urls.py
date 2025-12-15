from django.urls import path
from .views import (
    BonusListView,
    AdminBonusCreateView,
    ClaimBonusView,
)

urlpatterns = [
    path("rewards/", BonusListView.as_view(), name="user-bonuses"),
    path("rewards/admin/bonuses/create/", AdminBonusCreateView.as_view(), name="admin-create-bonus"),
    path("rewards/claim/<int:bonus_id>/", ClaimBonusView.as_view(), name="claim-bonus"),
]