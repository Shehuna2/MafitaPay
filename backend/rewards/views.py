# rewards/views.py
from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser
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
    API endpoint to claim an unlocked bonus.
    POST /api/rewards/claim/<bonus_id>/
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, bonus_id):
        # Get bonus and verify ownership
        bonus = get_object_or_404(Bonus, id=bonus_id)
        
        if bonus.user != request.user:
            return Response(
                {"error": "You do not have permission to claim this bonus."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Validate bonus can be claimed
        if bonus.status != "unlocked":
            return Response(
                {"error": f"Bonus cannot be claimed. Current status: {bonus.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Attempt to claim the bonus
        success = BonusService.claim_bonus(bonus)

        if success:
            # Refresh bonus from database
            bonus.refresh_from_db()
            
            # Get updated wallet info
            wallet = request.user.wallet
            
            return Response({
                "success": True,
                "message": f"Successfully claimed ₦{bonus.amount} bonus!",
                "bonus": BonusSerializer(bonus).data,
                "wallet": {
                    "balance": str(wallet.balance),
                    "locked_balance": str(wallet.locked_balance),
                }
            }, status=status.HTTP_200_OK)
        else:
            return Response(
                {"error": "Failed to claim bonus. It may have already been claimed or insufficient locked balance."},
                status=status.HTTP_400_BAD_REQUEST
            )
