# analytics/views.py
import csv
from datetime import datetime, timedelta
from decimal import Decimal
from django.db.models import Sum, Count, Avg, Q, F
from django.db.models.functions import TruncDate, TruncMonth
from django.http import JsonResponse, HttpResponse
from django.utils import timezone
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework import status

from accounts.models import User
from wallet.models import Wallet, WalletTransaction
from p2p.models import DepositOrder, WithdrawOrder, Deposit_P2P_Offer, Withdraw_P2P_Offer
from gasfee.models import CryptoPurchase
from rewards.models import Bonus

import logging

logger = logging.getLogger(__name__)


def safe_divide(numerator, denominator, default=0):
    """Safely divide two numbers, returning default if denominator is zero"""
    try:
        denom = float(denominator) if denominator else 0
        if denom == 0:
            return default
        return float(numerator) / denom
    except (TypeError, ValueError, ZeroDivisionError):
        return default


class DashboardOverviewView(APIView):
    """Quick overview metrics for CEO dashboard"""
    permission_classes = [IsAuthenticated, IsAdminUser]
    
    def get(self, request):
        try:
            # Get date range from query params (default to last 30 days)
            days = int(request.query_params.get('days', 30))
            start_date = timezone.now() - timedelta(days=days)
            
            # Use cache key for this specific query
            cache_key = f'dashboard_overview_{days}'
            cached_data = cache.get(cache_key)
            
            if cached_data:
                return Response(cached_data)
            
            # Calculate previous period for trend comparison
            previous_start_date = start_date - timedelta(days=days)
            
            # Total users
            total_users = User.objects.count()
            new_users = User.objects.filter(date_joined__gte=start_date).count()
            
            # Active users (users with transactions in the period)
            active_users = WalletTransaction.objects.filter(
                created_at__gte=start_date
            ).values('user').distinct().count()
            
            # Previous period active users for trend
            prev_active_users = WalletTransaction.objects.filter(
                created_at__gte=previous_start_date,
                created_at__lt=start_date
            ).values('user').distinct().count()
            
            # Wallet metrics
            total_balance = Wallet.objects.aggregate(
                total=Sum('balance')
            )['total'] or Decimal('0.00')
            
            total_locked = Wallet.objects.aggregate(
                total=Sum('locked_balance')
            )['total'] or Decimal('0.00')
            
            # Transaction metrics - all transactions in current period
            all_tx_stats = WalletTransaction.objects.filter(
                created_at__gte=start_date
            ).aggregate(
                total_count=Count('id'),
                successful_count=Count('id', filter=Q(status='success'))
            )
            
            # Successful transaction metrics
            tx_stats = WalletTransaction.objects.filter(
                created_at__gte=start_date,
                status='success'
            ).aggregate(
                total_volume=Sum('amount'),
                total_count=Count('id')
            )
            
            # Previous period transactions for trend
            prev_tx_stats = WalletTransaction.objects.filter(
                created_at__gte=previous_start_date,
                created_at__lt=start_date,
                status='success'
            ).aggregate(
                total_count=Count('id')
            )
            
            # Revenue (deposits)
            total_revenue = WalletTransaction.objects.filter(
                category='deposit',
                status='success',
                created_at__gte=start_date
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            
            # Previous period revenue for trend
            prev_revenue = WalletTransaction.objects.filter(
                category='deposit',
                status='success',
                created_at__gte=previous_start_date,
                created_at__lt=start_date
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            
            # P2P stats
            p2p_orders = DepositOrder.objects.filter(
                created_at__gte=start_date,
                status='completed'
            ).aggregate(
                count=Count('id'),
                volume=Sum('total_price')
            )
            
            # Previous period P2P for trend
            prev_p2p_orders = DepositOrder.objects.filter(
                created_at__gte=previous_start_date,
                created_at__lt=start_date,
                status='completed'
            ).aggregate(
                volume=Sum('total_price')
            )
            
            # Crypto purchases
            crypto_stats = CryptoPurchase.objects.filter(
                created_at__gte=start_date,
                status='completed'
            ).aggregate(
                count=Count('id'),
                volume=Sum('total_price')
            )
            
            # Bill payments (airtime + data)
            bill_payments = WalletTransaction.objects.filter(
                created_at__gte=start_date,
                category__in=['airtime', 'data'],
                status='success'
            ).aggregate(
                total_volume=Sum('amount')
            )
            
            # Rewards distributed (exclude reversed bonuses)
            rewards_distributed = Bonus.objects.filter(
                created_at__gte=start_date
            ).exclude(
                status='reversed'
            ).aggregate(
                total_amount=Sum('amount')
            )
            
            # Calculate success rate
            total_tx_count = all_tx_stats['total_count'] or 0
            successful_tx_count = all_tx_stats['successful_count'] or 0
            success_rate = round(safe_divide(successful_tx_count, total_tx_count, 0) * 100, 2)
            
            # Calculate trends (percentage change from previous period)
            # When previous period has no data, show 0 trend instead of artificial values
            if prev_tx_stats['total_count'] and prev_tx_stats['total_count'] > 0:
                transactions_trend = round(
                    safe_divide(
                        (tx_stats['total_count'] or 0) - prev_tx_stats['total_count'],
                        prev_tx_stats['total_count'],
                        0
                    ) * 100,
                    2
                )
            else:
                transactions_trend = 0.0
            
            if prev_revenue and float(prev_revenue) > 0:
                revenue_trend = round(
                    safe_divide(
                        float(total_revenue) - float(prev_revenue),
                        float(prev_revenue),
                        0
                    ) * 100,
                    2
                )
            else:
                revenue_trend = 0.0
            
            if prev_active_users and prev_active_users > 0:
                users_trend = round(
                    safe_divide(
                        active_users - prev_active_users,
                        prev_active_users,
                        0
                    ) * 100,
                    2
                )
            else:
                users_trend = 0.0
            
            prev_p2p_volume = float(prev_p2p_orders['volume'] or 0)
            if prev_p2p_volume > 0:
                p2p_trend = round(
                    safe_divide(
                        float(p2p_orders['volume'] or 0) - prev_p2p_volume,
                        prev_p2p_volume,
                        0
                    ) * 100,
                    2
                )
            else:
                p2p_trend = 0.0
            
            data = {
                'period_days': days,
                # Flat keys for frontend compatibility
                'total_transactions': tx_stats['total_count'] or 0,
                'total_revenue': float(total_revenue),
                'active_users': active_users,
                'p2p_volume': float(p2p_orders['volume'] or 0),
                'transactions_trend': transactions_trend,
                'revenue_trend': revenue_trend,
                'users_trend': users_trend,
                'p2p_trend': p2p_trend,
                'success_rate': success_rate,
                'successful_transactions': successful_tx_count,
                'bill_payments_volume': float(bill_payments['total_volume'] or 0),
                'crypto_volume': float(crypto_stats['volume'] or 0),
                'rewards_distributed': float(rewards_distributed['total_amount'] or 0),
                # Nested data for backward compatibility
                'users': {
                    'total': total_users,
                    'new': new_users,
                    # Growth rate: (new users / previous total) * 100
                    'growth_rate': round(safe_divide(new_users, total_users - new_users, 0) * 100, 2)
                },
                'wallet': {
                    'total_balance': float(total_balance),
                    'total_locked': float(total_locked),
                    'available_balance': float(total_balance - total_locked)
                },
                'transactions': {
                    'total_volume': float(tx_stats['total_volume'] or 0),
                    'total_count': tx_stats['total_count'] or 0,
                    'average_transaction': round(safe_divide(tx_stats['total_volume'] or 0, tx_stats['total_count'] or 0, 0), 2)
                },
                'revenue': {
                    'total': float(total_revenue),
                    'daily_average': round(safe_divide(total_revenue, days, 0), 2)
                },
                'p2p': {
                    'orders': p2p_orders['count'] or 0,
                    'volume': float(p2p_orders['volume'] or 0)
                },
                'crypto': {
                    'purchases': crypto_stats['count'] or 0,
                    'volume': float(crypto_stats['volume'] or 0)
                },
                'generated_at': timezone.now().isoformat()
            }
            
            # Cache for 5 minutes
            cache.set(cache_key, data, 60 * 5)
            
            return Response(data)
            
        except Exception as e:
            logger.error(f"Error in DashboardOverviewView: {str(e)}", exc_info=True)
            return Response(
                {'error': 'Failed to fetch dashboard overview'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class TransactionAnalyticsView(APIView):
    """Transaction statistics and trends"""
    permission_classes = [IsAuthenticated, IsAdminUser]
    
    def get(self, request):
        try:
            days = int(request.query_params.get('days', 30))
            start_date = timezone.now() - timedelta(days=days)
            
            cache_key = f'transaction_analytics_{days}'
            cached_data = cache.get(cache_key)
            
            if cached_data:
                return Response(cached_data)
            
            # Transaction breakdown by category
            by_category = WalletTransaction.objects.filter(
                created_at__gte=start_date,
                status='success'
            ).values('category').annotate(
                count=Count('id'),
                total_amount=Sum('amount')
            ).order_by('-total_amount')
            
            # Transaction breakdown by type (debit/credit)
            by_type = WalletTransaction.objects.filter(
                created_at__gte=start_date,
                status='success'
            ).values('tx_type').annotate(
                count=Count('id'),
                total_amount=Sum('amount')
            )
            
            # Daily transaction trend
            daily_trend = WalletTransaction.objects.filter(
                created_at__gte=start_date,
                status='success'
            ).annotate(
                date=TruncDate('created_at')
            ).values('date').annotate(
                count=Count('id'),
                volume=Sum('amount')
            ).order_by('date')
            
            # Status breakdown
            status_breakdown = WalletTransaction.objects.filter(
                created_at__gte=start_date
            ).values('status').annotate(
                count=Count('id')
            ).order_by('-count')
            
            # Success rate
            total_tx = WalletTransaction.objects.filter(
                created_at__gte=start_date
            ).count()
            
            successful_tx = WalletTransaction.objects.filter(
                created_at__gte=start_date,
                status='success'
            ).count()
            
            failed_tx = WalletTransaction.objects.filter(
                created_at__gte=start_date,
                status='failed'
            ).count()
            
            # Calculate total volume and average transaction
            total_volume_data = WalletTransaction.objects.filter(
                created_at__gte=start_date,
                status='success'
            ).aggregate(
                total_volume=Sum('amount'),
                total_count=Count('id')
            )
            
            total_volume = total_volume_data['total_volume'] or Decimal('0.00')
            total_count = total_volume_data['total_count'] or 0
            average_transaction = safe_divide(total_volume, total_count, 0)
            
            # Recent transactions for table
            recent_transactions = WalletTransaction.objects.filter(
                created_at__gte=start_date
            ).select_related('user').order_by('-created_at')[:50]
            
            data = {
                'period_days': days,
                # Flat keys for frontend compatibility
                'total_volume': float(total_volume),
                'total_count': total_count,
                'average_transaction': round(average_transaction, 2),
                # Nested summary for backward compatibility
                'summary': {
                    'total_transactions': total_tx,
                    'successful': successful_tx,
                    'failed': failed_tx,
                    'success_rate': round(safe_divide(successful_tx, total_tx, 0) * 100, 2)
                },
                'by_category': [
                    {
                        'category': item['category'],
                        'count': item['count'],
                        'total_amount': float(item['total_amount'] or 0)
                    }
                    for item in by_category
                ],
                # Frontend expects type_breakdown
                'type_breakdown': [
                    {
                        'type': item['tx_type'],
                        'count': item['count']
                    }
                    for item in by_type
                ],
                # Keep by_type for backward compatibility
                'by_type': [
                    {
                        'type': item['tx_type'],
                        'count': item['count'],
                        'total_amount': float(item['total_amount'] or 0)
                    }
                    for item in by_type
                ],
                # Frontend expects status_breakdown
                'status_breakdown': [
                    {
                        'status': item['status'],
                        'count': item['count']
                    }
                    for item in status_breakdown
                ],
                # Frontend expects volume_over_time
                'volume_over_time': [
                    {
                        'date': item['date'].isoformat(),
                        'count': item['count'],
                        'volume': float(item['volume'] or 0)
                    }
                    for item in daily_trend
                ],
                # Keep daily_trend for backward compatibility
                'daily_trend': [
                    {
                        'date': item['date'].isoformat(),
                        'count': item['count'],
                        'volume': float(item['volume'] or 0)
                    }
                    for item in daily_trend
                ],
                # Transactions for table
                'transactions': [
                    {
                        'created_at': tx.created_at.isoformat(),
                        'transaction_type': tx.category,
                        'amount': float(tx.amount),
                        'status': tx.status,
                        'username': tx.user.email
                    }
                    for tx in recent_transactions
                ],
                'generated_at': timezone.now().isoformat()
            }
            
            cache.set(cache_key, data, 60 * 5)
            return Response(data)
            
        except Exception as e:
            logger.error(f"Error in TransactionAnalyticsView: {str(e)}", exc_info=True)
            return Response(
                {'error': 'Failed to fetch transaction analytics'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class RevenueAnalyticsView(APIView):
    """Revenue breakdown by payment method and source"""
    permission_classes = [IsAuthenticated, IsAdminUser]
    
    def get(self, request):
        try:
            days = int(request.query_params.get('days', 30))
            start_date = timezone.now() - timedelta(days=days)
            
            cache_key = f'revenue_analytics_{days}'
            cached_data = cache.get(cache_key)
            
            if cached_data:
                return Response(cached_data)
            
            # Deposit revenue
            deposit_revenue = WalletTransaction.objects.filter(
                category='deposit',
                status='success',
                created_at__gte=start_date
            ).aggregate(
                total=Sum('amount'),
                count=Count('id')
            )
            
            # P2P revenue (completed orders)
            p2p_revenue = DepositOrder.objects.filter(
                status='completed',
                created_at__gte=start_date
            ).aggregate(
                total=Sum('total_price'),
                count=Count('id')
            )
            
            # Crypto purchase revenue
            crypto_revenue = CryptoPurchase.objects.filter(
                status='completed',
                created_at__gte=start_date
            ).aggregate(
                total=Sum('total_price'),
                count=Count('id')
            )
            
            # Monthly revenue trend
            monthly_trend = WalletTransaction.objects.filter(
                category='deposit',
                status='success',
                created_at__gte=start_date
            ).annotate(
                month=TruncMonth('created_at')
            ).values('month').annotate(
                revenue=Sum('amount'),
                count=Count('id')
            ).order_by('month')
            
            total_revenue = Decimal('0.00')
            total_revenue += deposit_revenue['total'] or Decimal('0.00')
            total_revenue += p2p_revenue['total'] or Decimal('0.00')
            total_revenue += crypto_revenue['total'] or Decimal('0.00')
            
            # Calculate net profit and expenses (simplified - using 80/20 split)
            net_profit = float(total_revenue) * 0.80
            total_expenses = float(total_revenue) * 0.20
            
            # Daily revenue trend for frontend
            daily_revenue_trend = WalletTransaction.objects.filter(
                category='deposit',
                status='success',
                created_at__gte=start_date
            ).annotate(
                date=TruncDate('created_at')
            ).values('date').annotate(
                revenue=Sum('amount'),
                count=Count('id')
            ).order_by('date')
            
            data = {
                'period_days': days,
                'total_revenue': float(total_revenue),
                # Flat keys for frontend compatibility
                'net_profit': round(net_profit, 2),
                'total_expenses': round(total_expenses, 2),
                # Revenue trend with profit
                'revenue_trend': [
                    {
                        'date': item['date'].isoformat(),
                        'revenue': float(item['revenue'] or 0),
                        'profit': round(float(item['revenue'] or 0) * 0.80, 2)
                    }
                    for item in daily_revenue_trend
                ],
                # Payment method breakdown
                'payment_method_breakdown': [
                    {'method': 'Deposits', 'revenue': float(deposit_revenue['total'] or 0)},
                    {'method': 'P2P', 'revenue': float(p2p_revenue['total'] or 0)},
                    {'method': 'Crypto', 'revenue': float(crypto_revenue['total'] or 0)}
                ],
                # Service breakdown (same as payment methods for now)
                'service_breakdown': [
                    {'service': 'Deposits', 'revenue': float(deposit_revenue['total'] or 0)},
                    {'service': 'P2P Trading', 'revenue': float(p2p_revenue['total'] or 0)},
                    {'service': 'Crypto Purchase', 'revenue': float(crypto_revenue['total'] or 0)}
                ],
                # Top payment methods for table
                'top_payment_methods': [
                    {
                        'method': 'Deposits',
                        'revenue': float(deposit_revenue['total'] or 0),
                        'count': deposit_revenue['count'] or 0,
                        'average': round(safe_divide(deposit_revenue['total'] or 0, deposit_revenue['count'] or 0, 0), 2)
                    },
                    {
                        'method': 'P2P',
                        'revenue': float(p2p_revenue['total'] or 0),
                        'count': p2p_revenue['count'] or 0,
                        'average': round(safe_divide(p2p_revenue['total'] or 0, p2p_revenue['count'] or 0, 0), 2)
                    },
                    {
                        'method': 'Crypto',
                        'revenue': float(crypto_revenue['total'] or 0),
                        'count': crypto_revenue['count'] or 0,
                        'average': round(safe_divide(crypto_revenue['total'] or 0, crypto_revenue['count'] or 0, 0), 2)
                    }
                ],
                # Backward compatibility
                'by_source': {
                    'deposits': {
                        'revenue': float(deposit_revenue['total'] or 0),
                        'count': deposit_revenue['count'] or 0,
                        'percentage': round(safe_divide(deposit_revenue['total'] or 0, total_revenue, 0) * 100, 2)
                    },
                    'p2p': {
                        'revenue': float(p2p_revenue['total'] or 0),
                        'count': p2p_revenue['count'] or 0,
                        'percentage': round(safe_divide(p2p_revenue['total'] or 0, total_revenue, 0) * 100, 2)
                    },
                    'crypto': {
                        'revenue': float(crypto_revenue['total'] or 0),
                        'count': crypto_revenue['count'] or 0,
                        'percentage': round(safe_divide(crypto_revenue['total'] or 0, total_revenue, 0) * 100, 2)
                    }
                },
                'monthly_trend': [
                    {
                        'month': item['month'].isoformat(),
                        'revenue': float(item['revenue'] or 0),
                        'count': item['count']
                    }
                    for item in monthly_trend
                ],
                'generated_at': timezone.now().isoformat()
            }
            
            cache.set(cache_key, data, 60 * 5)
            return Response(data)
            
        except Exception as e:
            logger.error(f"Error in RevenueAnalyticsView: {str(e)}", exc_info=True)
            return Response(
                {'error': 'Failed to fetch revenue analytics'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class UserAnalyticsView(APIView):
    """User metrics and growth trends"""
    permission_classes = [IsAuthenticated, IsAdminUser]
    
    def get(self, request):
        try:
            days = int(request.query_params.get('days', 30))
            start_date = timezone.now() - timedelta(days=days)
            
            cache_key = f'user_analytics_{days}'
            cached_data = cache.get(cache_key)
            
            if cached_data:
                return Response(cached_data)
            
            # Total users
            total_users = User.objects.count()
            new_users = User.objects.filter(date_joined__gte=start_date).count()
            verified_users = User.objects.filter(is_email_verified=True).count()
            merchants = User.objects.filter(is_merchant=True).count()
            
            # Active users (users with transactions in the period)
            active_users = WalletTransaction.objects.filter(
                created_at__gte=start_date
            ).values('user').distinct().count()
            
            # Users with wallets
            users_with_wallets = Wallet.objects.count()
            
            # Daily user registration trend
            daily_registrations = User.objects.filter(
                date_joined__gte=start_date
            ).annotate(
                date=TruncDate('date_joined')
            ).values('date').annotate(
                count=Count('id')
            ).order_by('date')
            
            # User engagement (transactions per user)
            tx_per_user = WalletTransaction.objects.filter(
                created_at__gte=start_date,
                status='success'
            ).values('user').annotate(
                tx_count=Count('id')
            ).aggregate(avg_tx=Avg('tx_count'))
            
            # Calculate retention rate and other metrics
            regular_user_count = total_users - merchants
            retention_rate = round(safe_divide(active_users, total_users, 0) * 100, 2)
            avg_daily_users = round(safe_divide(active_users, days, 0), 2)
            
            # User growth data with cumulative counts
            user_growth_data = []
            for item in daily_registrations:
                # Get cumulative users up to this date
                cumulative_users = User.objects.filter(date_joined__lte=item['date']).count()
                # Active users on this day
                day_active_users = WalletTransaction.objects.filter(
                    created_at__date=item['date']
                ).values('user').distinct().count()
                
                user_growth_data.append({
                    'date': item['date'].isoformat(),
                    'total_users': cumulative_users,
                    'new_users': item['count'],
                    'active_users': day_active_users
                })
            
            # Top referrers (mock data for now - requires referral model updates)
            from referrals.models import Referral
            top_referrers_data = []
            try:
                # Get top referrers by referral count
                referrer_stats = Referral.objects.filter(
                    created_at__gte=start_date
                ).values('referrer__email').annotate(
                    referral_count=Count('id'),
                    active_referrals=Count('id', filter=Q(referee__is_active=True))
                ).order_by('-referral_count')[:10]
                
                top_referrers_data = [
                    {
                        'username': item['referrer__email'] or 'Unknown',
                        'referral_count': item['referral_count'],
                        'active_referrals': item['active_referrals'],
                        'total_revenue': 0.0  # Can be calculated from referee transactions
                    }
                    for item in referrer_stats
                ]
            except Exception:
                # If referral model doesn't have the expected structure, use empty list
                pass
            
            data = {
                'period_days': days,
                # Flat keys for frontend compatibility
                'total_users': total_users,
                'new_users': new_users,
                'active_users': active_users,
                'verified_users': verified_users,
                'retention_rate': retention_rate,
                'merchant_count': merchants,
                'regular_user_count': regular_user_count,
                'avg_daily_users': avg_daily_users,
                # User growth chart data
                'user_growth': user_growth_data,
                # User segmentation for pie chart
                'user_segmentation': [
                    {'segment': 'Merchants', 'count': merchants},
                    {'segment': 'Regular Users', 'count': regular_user_count},
                    {'segment': 'Verified', 'count': verified_users},
                    {'segment': 'Unverified', 'count': total_users - verified_users}
                ],
                # Top referrers table
                'top_referrers': top_referrers_data,
                # Backward compatibility - nested summary
                'summary': {
                    'total_users': total_users,
                    'new_users': new_users,
                    'verified_users': verified_users,
                    'merchants': merchants,
                    'active_users': active_users,
                    'users_with_wallets': users_with_wallets,
                    'verification_rate': round(safe_divide(verified_users, total_users, 0) * 100, 2),
                    'activation_rate': round(safe_divide(active_users, total_users, 0) * 100, 2)
                },
                'engagement': {
                    'avg_transactions_per_user': round(tx_per_user['avg_tx'] or 0, 2)
                },
                'daily_registrations': [
                    {
                        'date': item['date'].isoformat(),
                        'count': item['count']
                    }
                    for item in daily_registrations
                ],
                'generated_at': timezone.now().isoformat()
            }
            
            cache.set(cache_key, data, 60 * 5)
            return Response(data)
            
        except Exception as e:
            logger.error(f"Error in UserAnalyticsView: {str(e)}", exc_info=True)
            return Response(
                {'error': 'Failed to fetch user analytics'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ServiceAnalyticsView(APIView):
    """Service performance metrics (P2P, crypto, bills)"""
    permission_classes = [IsAuthenticated, IsAdminUser]
    
    def get(self, request):
        try:
            days = int(request.query_params.get('days', 30))
            start_date = timezone.now() - timedelta(days=days)
            
            cache_key = f'service_analytics_{days}'
            cached_data = cache.get(cache_key)
            
            if cached_data:
                return Response(cached_data)
            
            # P2P Analytics
            p2p_deposit_orders = DepositOrder.objects.filter(
                created_at__gte=start_date
            ).aggregate(
                total_count=Count('id'),
                completed=Count('id', filter=Q(status='completed')),
                pending=Count('id', filter=Q(status='pending')),
                cancelled=Count('id', filter=Q(status='cancelled')),
                total_volume=Sum('total_price', filter=Q(status='completed'))
            )
            
            active_p2p_offers = Deposit_P2P_Offer.objects.filter(
                is_available=True
            ).count()
            
            # Crypto Analytics
            crypto_purchases = CryptoPurchase.objects.filter(
                created_at__gte=start_date
            ).aggregate(
                total_count=Count('id'),
                completed=Count('id', filter=Q(status='completed')),
                pending=Count('id', filter=Q(status='pending')),
                failed=Count('id', filter=Q(status='failed')),
                total_volume=Sum('total_price', filter=Q(status='completed'))
            )
            
            # Crypto by network
            crypto_by_network = CryptoPurchase.objects.filter(
                created_at__gte=start_date,
                status='completed'
            ).values('crypto__network').annotate(
                count=Count('id'),
                volume=Sum('total_price')
            ).order_by('-volume')
            
            # Bills Analytics (from transactions)
            bills_transactions = WalletTransaction.objects.filter(
                created_at__gte=start_date,
                category__in=['airtime', 'data', 'cable', 'electricity', 'education'],
                status='success'
            ).aggregate(
                total_count=Count('id'),
                total_volume=Sum('amount')
            )
            
            # Individual bill category volumes
            airtime_volume = WalletTransaction.objects.filter(
                created_at__gte=start_date,
                category='airtime',
                status='success'
            ).aggregate(volume=Sum('amount'), count=Count('id'))
            
            data_volume = WalletTransaction.objects.filter(
                created_at__gte=start_date,
                category='data',
                status='success'
            ).aggregate(volume=Sum('amount'), count=Count('id'))
            
            cable_volume = WalletTransaction.objects.filter(
                created_at__gte=start_date,
                category='cable',
                status='success'
            ).aggregate(volume=Sum('amount'), count=Count('id'))
            
            electricity_volume = WalletTransaction.objects.filter(
                created_at__gte=start_date,
                category='electricity',
                status='success'
            ).aggregate(volume=Sum('amount'), count=Count('id'))
            
            education_volume = WalletTransaction.objects.filter(
                created_at__gte=start_date,
                category='education',
                status='success'
            ).aggregate(volume=Sum('amount'), count=Count('id'))
            
            # P2P daily data for charts
            p2p_daily_deposits = DepositOrder.objects.filter(
                created_at__gte=start_date,
                status='completed'
            ).annotate(
                date=TruncDate('created_at')
            ).values('date').annotate(
                volume=Sum('total_price'),
                count=Count('id')
            ).order_by('date')
            
            # Get withdraw orders if model exists
            p2p_daily_withdraws = []
            try:
                p2p_daily_withdraws = WithdrawOrder.objects.filter(
                    created_at__gte=start_date,
                    status='completed'
                ).annotate(
                    date=TruncDate('created_at')
                ).values('date').annotate(
                    volume=Sum('total_price'),
                    count=Count('id')
                ).order_by('date')
            except Exception:
                pass
            
            # Combine P2P data
            p2p_data_dict = {}
            for item in p2p_daily_deposits:
                date_str = item['date'].isoformat()
                p2p_data_dict[date_str] = {
                    'date': date_str,
                    'deposits': float(item['volume'] or 0),
                    'withdrawals': 0.0
                }
            
            for item in p2p_daily_withdraws:
                date_str = item['date'].isoformat()
                if date_str in p2p_data_dict:
                    p2p_data_dict[date_str]['withdrawals'] = float(item['volume'] or 0)
                else:
                    p2p_data_dict[date_str] = {
                        'date': date_str,
                        'deposits': 0.0,
                        'withdrawals': float(item['volume'] or 0)
                    }
            
            p2p_data = list(p2p_data_dict.values())
            
            # Calculate totals
            p2p_vol = float(p2p_deposit_orders['total_volume'] or 0)
            bill_vol = float(bills_transactions['total_volume'] or 0)
            crypto_vol = float(crypto_purchases['total_volume'] or 0)
            total_service_transactions = (
                p2p_deposit_orders['total_count'] or 0
            ) + (
                bills_transactions['total_count'] or 0
            ) + (
                crypto_purchases['total_count'] or 0
            )
            
            data = {
                'period_days': days,
                # Flat keys for frontend compatibility
                'p2p_volume': p2p_vol,
                'bill_payment_volume': bill_vol,
                'crypto_volume': crypto_vol,
                'total_service_transactions': total_service_transactions,
                'airtime_volume': float(airtime_volume['volume'] or 0),
                'data_volume': float(data_volume['volume'] or 0),
                'cable_volume': float(cable_volume['volume'] or 0),
                'electricity_volume': float(electricity_volume['volume'] or 0),
                'education_volume': float(education_volume['volume'] or 0),
                # P2P chart data
                'p2p_data': p2p_data,
                # Bill payment breakdown
                'bill_payment_breakdown': [
                    {'category': 'Airtime', 'volume': float(airtime_volume['volume'] or 0)},
                    {'category': 'Data', 'volume': float(data_volume['volume'] or 0)},
                    {'category': 'Cable TV', 'volume': float(cable_volume['volume'] or 0)},
                    {'category': 'Electricity', 'volume': float(electricity_volume['volume'] or 0)},
                    {'category': 'Education', 'volume': float(education_volume['volume'] or 0)}
                ],
                # Service usage
                'service_usage': [
                    {'service': 'P2P Trading', 'count': p2p_deposit_orders['total_count'] or 0},
                    {'service': 'Crypto Purchase', 'count': crypto_purchases['total_count'] or 0},
                    {'service': 'Bill Payments', 'count': bills_transactions['total_count'] or 0}
                ],
                # Top services table
                'top_services': [
                    {
                        'service_name': 'P2P Trading',
                        'usage_count': p2p_deposit_orders['total_count'] or 0,
                        'revenue': p2p_vol,
                        'success_rate': round(safe_divide(p2p_deposit_orders['completed'] or 0, p2p_deposit_orders['total_count'] or 0, 0) * 100, 2)
                    },
                    {
                        'service_name': 'Crypto Purchase',
                        'usage_count': crypto_purchases['total_count'] or 0,
                        'revenue': crypto_vol,
                        'success_rate': round(safe_divide(crypto_purchases['completed'] or 0, crypto_purchases['total_count'] or 0, 0) * 100, 2)
                    },
                    {
                        'service_name': 'Airtime',
                        'usage_count': airtime_volume['count'] or 0,
                        'revenue': float(airtime_volume['volume'] or 0),
                        'success_rate': 100.0  # All completed transactions
                    },
                    {
                        'service_name': 'Data',
                        'usage_count': data_volume['count'] or 0,
                        'revenue': float(data_volume['volume'] or 0),
                        'success_rate': 100.0
                    }
                ],
                # Backward compatibility - nested structure
                'p2p': {
                    'total_orders': p2p_deposit_orders['total_count'] or 0,
                    'completed': p2p_deposit_orders['completed'] or 0,
                    'pending': p2p_deposit_orders['pending'] or 0,
                    'cancelled': p2p_deposit_orders['cancelled'] or 0,
                    'total_volume': p2p_vol,
                    'active_offers': active_p2p_offers,
                    'completion_rate': round(safe_divide(p2p_deposit_orders['completed'] or 0, p2p_deposit_orders['total_count'] or 0, 0) * 100, 2)
                },
                'crypto': {
                    'total_purchases': crypto_purchases['total_count'] or 0,
                    'completed': crypto_purchases['completed'] or 0,
                    'pending': crypto_purchases['pending'] or 0,
                    'failed': crypto_purchases['failed'] or 0,
                    'total_volume': crypto_vol,
                    'success_rate': round(safe_divide(crypto_purchases['completed'] or 0, crypto_purchases['total_count'] or 0, 0) * 100, 2),
                    'by_network': [
                        {
                            'network': item['crypto__network'],
                            'count': item['count'],
                            'volume': float(item['volume'] or 0)
                        }
                        for item in crypto_by_network
                    ]
                },
                'bills': {
                    'total_transactions': bills_transactions['total_count'] or 0,
                    'total_volume': bill_vol,
                    'airtime_count': airtime_volume['count'] or 0,
                    'data_count': data_volume['count'] or 0
                },
                'generated_at': timezone.now().isoformat()
            }
            
            cache.set(cache_key, data, 60 * 5)
            return Response(data)
            
        except Exception as e:
            logger.error(f"Error in ServiceAnalyticsView: {str(e)}", exc_info=True)
            return Response(
                {'error': 'Failed to fetch service analytics'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class KPIAnalyticsView(APIView):
    """Key Performance Indicators"""
    permission_classes = [IsAuthenticated, IsAdminUser]
    
    def get(self, request):
        try:
            days = int(request.query_params.get('days', 30))
            start_date = timezone.now() - timedelta(days=days)
            
            cache_key = f'kpi_analytics_{days}'
            cached_data = cache.get(cache_key)
            
            if cached_data:
                return Response(cached_data)
            
            # Total platform value
            total_wallet_balance = Wallet.objects.aggregate(
                total=Sum('balance')
            )['total'] or Decimal('0.00')
            
            # Transaction success rate
            total_tx = WalletTransaction.objects.filter(
                created_at__gte=start_date
            ).count()
            
            successful_tx = WalletTransaction.objects.filter(
                created_at__gte=start_date,
                status='success'
            ).count()
            
            # Average transaction value
            avg_tx_value = WalletTransaction.objects.filter(
                created_at__gte=start_date,
                status='success'
            ).aggregate(avg=Avg('amount'))['avg'] or Decimal('0.00')
            
            # Customer Lifetime Value (CLV) - simplified
            total_revenue = WalletTransaction.objects.filter(
                category='deposit',
                status='success'
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            
            total_users = User.objects.count()
            clv = safe_divide(total_revenue, total_users, 0)
            
            # User retention (active users ratio)
            active_users = WalletTransaction.objects.filter(
                created_at__gte=start_date
            ).values('user').distinct().count()
            
            retention_rate = safe_divide(active_users, total_users, 0) * 100
            
            # Calculate previous period metrics for trends
            previous_start_date = start_date - timedelta(days=days)
            
            # Previous period metrics
            prev_total_tx = WalletTransaction.objects.filter(
                created_at__gte=previous_start_date,
                created_at__lt=start_date
            ).count()
            
            prev_successful_tx = WalletTransaction.objects.filter(
                created_at__gte=previous_start_date,
                created_at__lt=start_date,
                status='success'
            ).count()
            
            prev_revenue = WalletTransaction.objects.filter(
                category='deposit',
                status='success',
                created_at__gte=previous_start_date,
                created_at__lt=start_date
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            
            prev_active_users = WalletTransaction.objects.filter(
                created_at__gte=previous_start_date,
                created_at__lt=start_date
            ).values('user').distinct().count()
            
            # DAU - Daily Active Users (users active today)
            today = timezone.now().date()
            dau = WalletTransaction.objects.filter(
                created_at__date=today
            ).values('user').distinct().count()
            
            # MAU - Monthly Active Users (last 30 days)
            mau_start = timezone.now() - timedelta(days=30)
            mau = WalletTransaction.objects.filter(
                created_at__gte=mau_start
            ).values('user').distinct().count()
            
            # Previous DAU and MAU for trends
            yesterday = today - timedelta(days=1)
            prev_dau = WalletTransaction.objects.filter(
                created_at__date=yesterday
            ).values('user').distinct().count()
            
            prev_mau_start = mau_start - timedelta(days=30)
            prev_mau = WalletTransaction.objects.filter(
                created_at__gte=prev_mau_start,
                created_at__lt=mau_start
            ).values('user').distinct().count()
            
            # Calculate KPI metrics
            transaction_success_rate = round(safe_divide(successful_tx, total_tx, 0) * 100, 2)
            prev_success_rate = round(safe_divide(prev_successful_tx, prev_total_tx, 0) * 100, 2)
            
            # CAC - Customer Acquisition Cost (simplified - marketing spend / new users)
            # Using a simplified calculation: total expenses / new users in period
            new_users_period = User.objects.filter(date_joined__gte=start_date).count()
            cac = safe_divide(float(total_revenue) * 0.20, new_users_period, 0)  # Assume 20% of revenue as acquisition cost
            
            # ARPU - Average Revenue Per User
            arpu = safe_divide(float(total_revenue), active_users, 0)
            prev_arpu = safe_divide(float(prev_revenue), prev_active_users, 0)
            
            # Churn rate (simplified - users who became inactive)
            total_users_prev_period = User.objects.filter(date_joined__lt=start_date).count()
            churn_rate = round(safe_divide(total_users_prev_period - active_users, total_users_prev_period, 0) * 100, 2)
            
            # Growth rates
            user_growth_rate = round(safe_divide(new_users_period, total_users - new_users_period, 0) * 100, 2) if total_users > new_users_period else 0.0
            revenue_growth_rate = round(safe_divide(float(total_revenue) - float(prev_revenue), float(prev_revenue), 0) * 100, 2) if float(prev_revenue) > 0 else 0.0
            transaction_growth_rate = round(safe_divide(successful_tx - prev_successful_tx, prev_successful_tx, 0) * 100, 2) if prev_successful_tx > 0 else 0.0
            
            # Calculate trends (percentage change)
            dau_trend = round(safe_divide(dau - prev_dau, prev_dau, 0) * 100, 2) if prev_dau > 0 else 0.0
            mau_trend = round(safe_divide(mau - prev_mau, prev_mau, 0) * 100, 2) if prev_mau > 0 else 0.0
            cac_trend = 0.0  # Simplified - would need historical CAC data
            ltv_trend = 0.0  # Simplified - would need historical LTV data
            arpu_trend = round(safe_divide(arpu - prev_arpu, prev_arpu, 0) * 100, 2) if prev_arpu > 0 else 0.0
            success_rate_trend = round(transaction_success_rate - prev_success_rate, 2)
            churn_rate_trend = 0.0  # Simplified
            retention_trend = round(safe_divide(active_users - prev_active_users, prev_active_users, 0) * 100, 2) if prev_active_users > 0 else 0.0
            stickiness_trend = round(safe_divide(dau, mau, 0) * 100, 2) if mau > 0 else 0.0
            ltv_cac_ratio = safe_divide(clv, cac, 0)
            ltv_cac_ratio_trend = 0.0  # Simplified
            
            # Targets (these would ideally come from a settings/config)
            dau_target = int(total_users * 0.3)  # 30% of total users as daily target
            mau_target = int(total_users * 0.7)  # 70% of total users as monthly target
            
            # Bonus distribution
            bonus_stats = Bonus.objects.filter(
                created_at__gte=start_date
            ).aggregate(
                total_amount=Sum('amount'),
                total_count=Count('id'),
                unlocked=Count('id', filter=Q(status='unlocked')),
                used=Count('id', filter=Q(status='used'))
            )
            
            data = {
                'period_days': days,
                # Flat KPI keys for frontend compatibility
                'dau': dau,
                'mau': mau,
                'cac': round(cac, 2),
                'ltv': round(float(clv), 2),
                'arpu': round(arpu, 2),
                'transaction_success_rate': transaction_success_rate,
                'churn_rate': churn_rate,
                'retention_rate': round(retention_rate, 2),
                'user_growth_rate': user_growth_rate,
                'revenue_growth_rate': revenue_growth_rate,
                'transaction_growth_rate': transaction_growth_rate,
                # Trend values
                'dau_trend': dau_trend,
                'mau_trend': mau_trend,
                'cac_trend': cac_trend,
                'ltv_trend': ltv_trend,
                'arpu_trend': arpu_trend,
                'success_rate_trend': success_rate_trend,
                'churn_rate_trend': churn_rate_trend,
                'retention_trend': retention_trend,
                'stickiness_trend': stickiness_trend,
                'ltv_cac_ratio_trend': ltv_cac_ratio_trend,
                'user_growth_trend': user_growth_rate,
                'revenue_growth_trend': revenue_growth_rate,
                'transaction_growth_trend': transaction_growth_rate,
                # Target values
                'dau_target': dau_target,
                'mau_target': mau_target,
                # Backward compatibility - nested KPIs
                'kpis': {
                    'total_platform_value': float(total_wallet_balance),
                    'transaction_success_rate': transaction_success_rate,
                    'average_transaction_value': float(avg_tx_value),
                    'customer_lifetime_value': round(float(clv), 2),
                    'user_retention_rate': round(retention_rate, 2),
                    'total_users': total_users,
                    'active_users': active_users
                },
                'bonuses': {
                    'total_distributed': float(bonus_stats['total_amount'] or 0),
                    'total_count': bonus_stats['total_count'] or 0,
                    'unlocked': bonus_stats['unlocked'] or 0,
                    'used': bonus_stats['used'] or 0,
                    'utilization_rate': round(safe_divide(bonus_stats['used'] or 0, bonus_stats['total_count'] or 0, 0) * 100, 2)
                },
                'generated_at': timezone.now().isoformat()
            }
            
            cache.set(cache_key, data, 60 * 5)
            return Response(data)
            
        except Exception as e:
            logger.error(f"Error in KPIAnalyticsView: {str(e)}", exc_info=True)
            return Response(
                {'error': 'Failed to fetch KPI analytics'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ReportExportView(APIView):
    """Export reports as CSV or JSON"""
    permission_classes = [IsAuthenticated, IsAdminUser]
    
    def get(self, request):
        try:
            report_type = request.query_params.get('type', 'transactions')
            export_format = request.query_params.get('format', 'json')
            days = int(request.query_params.get('days', 30))
            start_date = timezone.now() - timedelta(days=days)
            
            if report_type == 'transactions':
                queryset = WalletTransaction.objects.filter(
                    created_at__gte=start_date
                ).select_related('user', 'wallet').order_by('-created_at')
                
                if export_format == 'csv':
                    response = HttpResponse(content_type='text/csv')
                    response['Content-Disposition'] = f'attachment; filename="transactions_{timezone.now().strftime("%Y%m%d")}.csv"'
                    
                    writer = csv.writer(response)
                    writer.writerow(['ID', 'User Email', 'Type', 'Category', 'Amount', 'Status', 'Created At'])
                    
                    for tx in queryset[:1000]:  # Limit to 1000 records
                        writer.writerow([
                            tx.id,
                            tx.user.email,
                            tx.tx_type,
                            tx.category,
                            tx.amount,
                            tx.status,
                            tx.created_at.isoformat()
                        ])
                    
                    return response
                else:
                    data = [
                        {
                            'id': tx.id,
                            'user_email': tx.user.email,
                            'type': tx.tx_type,
                            'category': tx.category,
                            'amount': float(tx.amount),
                            'status': tx.status,
                            'created_at': tx.created_at.isoformat()
                        }
                        for tx in queryset[:1000]
                    ]
                    return Response({'transactions': data, 'count': len(data)})
                    
            elif report_type == 'users':
                queryset = User.objects.all().order_by('-date_joined')
                
                if export_format == 'csv':
                    response = HttpResponse(content_type='text/csv')
                    response['Content-Disposition'] = f'attachment; filename="users_{timezone.now().strftime("%Y%m%d")}.csv"'
                    
                    writer = csv.writer(response)
                    writer.writerow(['ID', 'Email', 'Is Merchant', 'Email Verified', 'Date Joined'])
                    
                    for user in queryset[:1000]:
                        writer.writerow([
                            user.id,
                            user.email,
                            user.is_merchant,
                            user.is_email_verified,
                            user.date_joined.isoformat()
                        ])
                    
                    return response
                else:
                    data = [
                        {
                            'id': user.id,
                            'email': user.email,
                            'is_merchant': user.is_merchant,
                            'is_email_verified': user.is_email_verified,
                            'date_joined': user.date_joined.isoformat()
                        }
                        for user in queryset[:1000]
                    ]
                    return Response({'users': data, 'count': len(data)})
                    
            else:
                return Response(
                    {'error': 'Invalid report type. Choose: transactions, users'},
                    status=status.HTTP_400_BAD_REQUEST
                )
                
        except Exception as e:
            logger.error(f"Error in ReportExportView: {str(e)}", exc_info=True)
            return Response(
                {'error': 'Failed to export report'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
