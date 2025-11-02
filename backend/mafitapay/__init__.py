from celery import Celery
import os
import ssl

redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

app = Celery(
    "mafitapay",
    broker=redis_url,
    backend=redis_url,
)

# Detect whether the URL uses TLS
if redis_url.startswith("rediss://"):
    app.conf.update(
        broker_use_ssl={
            "ssl_cert_reqs": ssl.CERT_NONE
        },
        redis_backend_use_ssl={
            "ssl_cert_reqs": ssl.CERT_NONE
        }
    )
else:
    # Local or non-TLS Redis
    app.conf.update(
        broker_use_ssl=None,
        redis_backend_use_ssl=None
    )

# Optional — your Celery settings (if you have them)
app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)
