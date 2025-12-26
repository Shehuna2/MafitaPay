# wallet/permissions.py
from rest_framework import permissions


class IsMerchantOrSuperUser(permissions.BasePermission):
    """
    Custom permission to only allow merchant users or superusers.
    Used for card deposit endpoints.
    """
    
    def has_permission(self, request, view):
        # Must be authenticated
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Allow superusers
        if request.user.is_superuser:
            return True
        
        # Allow merchants
        if hasattr(request.user, 'is_merchant') and request.user.is_merchant:
            return True
        
        return False
