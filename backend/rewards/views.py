# rewards/views.py
from rest_framework import generics, permissions, status
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from .models import Bonus, BonusType
from .serializers import BonusSerializer, BonusTypeSerializer
from .services import BonusService


class BonusListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = BonusSerializer

    def get_queryset(self):
        return Bonus.objects.filter(user=self.request.user)


class AdminBonusCreateView(generics.CreateAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = BonusSerializer
    queryset = Bonus.objects.all()


class ClaimBonusView(APIView):
    """
    POST /api/rewards/<pk>/claim/
    Allows authenticated user to claim an unlocked bonus (moves locked -> available balance).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, format=None):
        bonus = get_object_or_404(Bonus, pk=pk)

        # Ensure the requesting user owns the bonus
        if bonus.user_id != request.user.id:
            return Response({"detail": "You do not have permission to claim this bonus."}, status=status.HTTP_403_FORBIDDEN)

        # Only unlocked bonuses can be claimed
        if bonus.status != "unlocked":
            return Response({"detail": f"Bonus is not claimable (status={bonus.status})."}, status=status.HTTP_400_BAD_REQUEST)

        success = BonusService.claim_bonus(bonus)
        if not success:
            return Response({"detail": "Failed to claim bonus. It may have been claimed already or there is insufficient locked balance."}, status=status.HTTP_409_CONFLICT)

        serializer = BonusSerializer(bonus, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)