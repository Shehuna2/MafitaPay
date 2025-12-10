# rewards/views.py
from rest_framework import generics, permissions
from .models import Bonus, BonusType
from .serializers import BonusSerializer, BonusTypeSerializer

class BonusListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = BonusSerializer

    def get_queryset(self):
        return Bonus.objects.filter(user=self.request.user)

from rest_framework.permissions import IsAdminUser
class AdminBonusCreateView(generics.CreateAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = BonusSerializer
    queryset = Bonus.objects.all()
