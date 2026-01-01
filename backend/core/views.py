from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from .models import AppSettings


@csrf_exempt
@require_http_methods(["GET"])
def maintenance_status(request):
    """
    Public endpoint to check maintenance status.
    This endpoint is always accessible, even during maintenance.
    """
    settings = AppSettings.get_settings()
    
    response_data = {
        'maintenance_enabled': settings.maintenance_enabled,
        'message': settings.maintenance_message if settings.maintenance_enabled else None,
        'show_countdown': settings.show_countdown,
    }
    
    # Add timing information if available and maintenance is enabled
    if settings.maintenance_enabled:
        if settings.maintenance_start_time:
            response_data['start_time'] = settings.maintenance_start_time.isoformat()
        
        if settings.maintenance_end_time:
            response_data['end_time'] = settings.maintenance_end_time.isoformat()
    
    return JsonResponse(response_data)
