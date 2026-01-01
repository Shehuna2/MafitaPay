from django.urls import path
from . import views

urlpatterns = [
    path('maintenance-status/', views.maintenance_status, name='maintenance-status'),
]
