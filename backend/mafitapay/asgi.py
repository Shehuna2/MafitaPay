# backend/mafitapay/asgi.py
import os
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application
from channels.auth import AuthMiddlewareStack
from p2p import routing as p2p_routing

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mafitapay.settings')

django_asgi_app = get_asgi_application()

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(
            p2p_routing.websocket_urlpatterns
        )
    ),
})
