from django.urls import path
from .views import (
    BonusListView,
    AdminBonusCreateView,
)

urlpatterns = [
    path("api/rewards/", BonusListView.as_view(), name="user-bonuses"),
    path("api/rewards/admin/bonuses/create/", AdminBonusCreateView.as_view(), name="admin-create-bonus"),
]