from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from django.urls import get_resolver

def debug_urls(request):
    resolver = get_resolver()
    return JsonResponse({str(k): str(v) for k, v in resolver.reverse_dict.items()})

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('p2p.urls')),
    path('', include('gasfee.urls')),
    path('', include('bills.urls')),
    path('', include('wallet.urls')),
    path('', include('rewards.urls')),
    path('api/', include('accounts.urls')),
    path('api/', include('wallet.urls')),
    path('api/', include('p2p.urls')),
    path('api/', include('bills.urls')),
    path('api/', include('rewards.urls')),
    path('api/', include('core.urls')),  # Maintenance mode API
    path('debug-urls/', debug_urls),  
]


if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)