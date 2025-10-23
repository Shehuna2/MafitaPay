import logging

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils.timezone import make_aware
from datetime import datetime


from rest_framework import generics, permissions
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Wallet, WalletTransaction, Notification
from .serializers import WalletTransactionSerializer, WalletSerializer, NotificationSerializer

User = get_user_model()



class WalletView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        try:
            wallet = Wallet.objects.get(user=request.user)
            wallet.refresh_from_db()  # ✅ ensure fresh data
            serializer = WalletSerializer(wallet)
            return Response(serializer.data)
        except Wallet.DoesNotExist:
            return Response({
                "balance": 0,
                "locked_balance": 0,
                "van_account_number": None,
                "van_bank_name": None,
                "van_provider": None,
            })

class StandardResultsSetPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"  # allow frontend override
    max_page_size = 100


class WalletTransactionListView(generics.ListAPIView):
    serializer_class = WalletTransactionSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        try:
            qs = WalletTransaction.objects.filter(user=self.request.user).order_by("-created_at")
            print(f"Queryset count for user {self.request.user}: {qs.count()}")
            category = self.request.query_params.get("category")
            status = self.request.query_params.get("status")
            tx_type = self.request.query_params.get("tx_type")
            start_date = self.request.query_params.get("start_date")
            end_date = self.request.query_params.get("end_date")
            search = self.request.query_params.get("search")

            if category:
                qs = qs.filter(category__iexact=category)
            if status:
                qs = qs.filter(status__iexact=status)
            if tx_type:
                qs = qs.filter(tx_type__iexact=tx_type)
            if start_date:
                try:
                    start = make_aware(datetime.strptime(start_date, "%Y-%m-%d"))
                    qs = qs.filter(created_at__gte=start)
                except ValueError as e:
                    print(f"Invalid start_date: {e}")
            if end_date:
                try:
                    end = make_aware(datetime.strptime(end_date, "%Y-%m-%d"))
                    qs = qs.filter(created_at__lte=end)
                except ValueError as e:
                    print(f"Invalid end_date: {e}")
            if search:
                qs = qs.filter(
                    Q(reference__icontains=search) |
                    Q(request_id__icontains=search) |
                    Q(metadata__icontains=search)
                )
            print(f"Filtered queryset count: {qs.count()}")
            return qs
        except Exception as e:
            print(f"Error in get_queryset: {str(e)}")
            raise

class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

class NotificationMarkReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({"detail": "All notifications marked as read"})