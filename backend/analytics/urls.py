# analytics/urls.py
from django.urls import path
from .views import (
    DashboardOverviewView,
    TransactionAnalyticsView,
    RevenueAnalyticsView,
    UserAnalyticsView,
    ServiceAnalyticsView,
    KPIAnalyticsView,
    ReportExportView,
)

urlpatterns = [
    path('dashboard/overview/', DashboardOverviewView.as_view(), name='analytics-dashboard-overview'),
    path('transactions/', TransactionAnalyticsView.as_view(), name='analytics-transactions'),
    path('revenue/', RevenueAnalyticsView.as_view(), name='analytics-revenue'),
    path('users/', UserAnalyticsView.as_view(), name='analytics-users'),
    path('services/', ServiceAnalyticsView.as_view(), name='analytics-services'),
    path('kpis/', KPIAnalyticsView.as_view(), name='analytics-kpis'),
    path('reports/export/', ReportExportView.as_view(), name='analytics-reports-export'),
]
