from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin
from .models import AppSettings
import logging

logger = logging.getLogger(__name__)


class MaintenanceModeMiddleware(MiddlewareMixin):
    """
    Middleware to intercept requests during maintenance mode.
    Returns 503 Service Unavailable for non-admin requests.
    """
    
    # Paths that should always be accessible during maintenance
    EXEMPT_PATHS = [
        '/admin/',
        '/api/maintenance-status/',
    ]
    
    def process_request(self, request):
        """Check if maintenance mode is active and handle accordingly"""
        
        # Check if any exempt path matches
        path = request.path
        if any(path.startswith(exempt) for exempt in self.EXEMPT_PATHS):
            return None
        
        # Check if user is staff/admin (they can always access)
        if hasattr(request, 'user') and request.user.is_authenticated:
            if request.user.is_staff or request.user.is_superuser:
                return None
        
        # Check if maintenance mode is active
        if AppSettings.is_maintenance_active():
            settings = AppSettings.get_settings()
            
            response_data = {
                'status': 'maintenance',
                'message': settings.maintenance_message,
                'maintenance_enabled': True,
                'show_countdown': settings.show_countdown,
            }
            
            # Add timing information if available
            if settings.maintenance_start_time:
                response_data['start_time'] = settings.maintenance_start_time.isoformat()
            
            if settings.maintenance_end_time:
                response_data['end_time'] = settings.maintenance_end_time.isoformat()
            
            logger.info(f"Maintenance mode active: blocking request to {path}")
            
            return JsonResponse(
                response_data,
                status=503
            )
        
        return None
