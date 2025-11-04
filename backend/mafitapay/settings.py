import os
import ssl
import json
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv
import dj_database_url


# --------------------------------------------------
# 1. ENVIRONMENT DETECTION
# --------------------------------------------------
if os.getenv("RENDER") is None and Path(".env").exists():
    load_dotenv()

DEBUG = os.getenv("DJANGO_DEBUG", "True") == "True"
BASE_DIR = Path(__file__).resolve().parent.parent

# --------------------------------------------------
# 2. SECURITY
# --------------------------------------------------
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = os.getenv("DJANGO_TEST_KEY")
    else:
        raise ValueError("DJANGO_SECRET_KEY required in production")

# --------------------------------------------------
# 3. HOSTS
# --------------------------------------------------
_allowed = os.getenv("ALLOWED_HOSTS", "")
ALLOWED_HOSTS = [h.strip() for h in _allowed.split(",") if h.strip()]

if DEBUG:
    ALLOWED_HOSTS += ["localhost", "127.0.0.1"]
    ngrok = os.getenv("NGROK_HOST", "")
    ALLOWED_HOSTS += [h for h in ngrok.split(",") if h]

if not ALLOWED_HOSTS and not DEBUG:
    raise ValueError("ALLOWED_HOSTS required in production")

# --------------------------------------------------
# 4. APPS & MIDDLEWARE
# --------------------------------------------------
INSTALLED_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "whitenoise.runserver_nostatic",
    "channels",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "accounts",
    "referrals",
    "wallet",
    "p2p",
    "gasfee",
    "bills",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",   # <-- WhiteNoise
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# --------------------------------------------------
# 5. URLS & TEMPLATES
# --------------------------------------------------
ROOT_URLCONF = "mafitapay.urls"
WSGI_APPLICATION = "mafitapay.wsgi.application"
ASGI_APPLICATION = "mafitapay.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# --------------------------------------------------
# 6. DATABASE
# --------------------------------------------------
DATABASES = {
    "default": dj_database_url.config(
        default="sqlite:///" + str(BASE_DIR / "db.sqlite3"),
        conn_max_age=600,
        ssl_require=not DEBUG,
    )
}

# --------------------------------------------------
# 7. STATIC & MEDIA
# --------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = os.getenv("STATIC_ROOT", "/tmp/staticfiles")   # <-- writable on Render
STATICFILES_DIRS = [BASE_DIR / "static"] if DEBUG else []

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# --------------------------------------------------
# 8. CORS
# --------------------------------------------------
CORS_ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",") if o.strip()
]

if DEBUG:
    CORS_ALLOWED_ORIGINS += [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://.*\.ngrok\.io$",
    r"^https://.*\.onrender\.com$",
]

# --------------------------------------------------
# 9. SECURITY HEADERS
# --------------------------------------------------
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = not DEBUG
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_HSTS_SECONDS = 31536000 if not DEBUG else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG

# --------------------------------------------------
# 10. AUTH & REST
# --------------------------------------------------
AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = [
    "accounts.backends.EmailBackend",
    "django.contrib.auth.backends.ModelBackend",
]

REST_FRAMEWORK = {
    "EXCEPTION_HANDLER": "accounts.utils.custom_exception_handler",
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}

# --------------------------------------------------
# 11. EMAIL
# --------------------------------------------------
# EMAIL_BACKEND = (
#     "django.core.mail.backends.console.EmailBackend"
#     if DEBUG
#     else os.getenv("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
# )

DEBUG = os.getenv("DEBUG", "false").lower() == "true"

EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")


EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.sendgrid.net")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "True") == "True"
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD")
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "no-reply@mafitapay.com")

# --------------------------------------------------
# 12. URLs
# --------------------------------------------------
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
BACKEND_URL = os.getenv("BACKEND_URL", BASE_URL)


# --------------------------------------------------
# 13. REDIS (Celery / Cache / Channels)
# --------------------------------------------------
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")


ssl_options = {}
if REDIS_URL.startswith("rediss://"):
    ssl_options = {
        "ssl_cert_reqs": ssl.CERT_REQUIRED,
        "ssl_ca_certs": "/etc/ssl/certs/ca-certificates.crt",
    }


# --- Celery ---
CELERY_BROKER_URL = REDIS_URL + "/0"
CELERY_RESULT_BACKEND = REDIS_URL + "/0"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_BEAT_SCHEDULE = {
    "check-sell-orders-every-minute": {
        "task": "bills.tasks.check_sell_orders",
        "schedule": 60.0,
    },
}

# Add SSL configuration for Celery
if REDIS_URL.startswith("rediss://"):
    CELERY_BROKER_USE_SSL = ssl_options
    CELERY_RESULT_BACKEND_USE_SSL = ssl_options


# --- Channels ---
if DEBUG:
    CHANNEL_LAYERS = {
        "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"},
    }
else:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [{
                    "address": REDIS_URL + "/2",
                    **ssl_options,
                }],
            },
        },
    }

# --- Cache ---
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": REDIS_URL + "/1",
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
            **ssl_options,
        },
    }
}

CACHE_TTL = 300

# --------------------------------------------------
# 14. LOGGING
# --------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO" if not DEBUG else "DEBUG"},
}

# --------------------------------------------------
# 15. ALL YOUR API KEYS / CUSTOM SETTINGS
# --------------------------------------------------
BYBIT_RECEIVE_DETAILS = json.loads(os.getenv("BYBIT_RECEIVE_DETAILS", "{}"))
BITGET_RECEIVE_DETAILS = json.loads(os.getenv("BITGET_RECEIVE_DETAILS", "{}"))
MEXC_RECEIVE_DETAILS = json.loads(os.getenv("MEXC_RECEIVE_DETAILS", "{}"))
GATEIO_RECEIVE_DETAILS = json.loads(os.getenv("GATEIO_RECEIVE_DETAILS", "{}"))
BINANCE_RECEIVE_DETAILS = json.loads(os.getenv("BINANCE_RECEIVE_DETAILS", "{}"))

BINANCE_API_KEY = os.getenv("BINANCE_API_KEY")
BINANCE_API_SECRET = os.getenv("BINANCE_API_SECRET")

TONCENTER_API_KEY = os.getenv("TONCENTER_API_KEY")
TON_API_URL = os.getenv("TON_API_URL")

BSC_SENDER_PRIVATE_KEY = os.getenv("BSC_SENDER_PRIVATE_KEY")
BSC_RPC_URL = os.getenv("BSC_RPC_URL")

FLUTTERWAVE_PUBLIC_KEY = os.getenv("FLUTTERWAVE_PUBLIC_KEY")
FLUTTERWAVE_SECRET_KEY = os.getenv("FLUTTERWAVE_SECRET_KEY")
FLUTTERWAVE_HASH_KEY = os.getenv("FLUTTERWAVE_HASH_KEY")

PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY")
PAYSTACK_PUBLIC_KEY = os.getenv("PAYSTACK_PUBLIC_KEY")

NINE_PSB_CLIENT_ID = os.getenv("NINE_PSB_CLIENT_ID")
NINE_PSB_API_KEY = os.getenv("NINE_PSB_API_KEY")
NINE_PSB_API_BASE_URL = os.getenv("NINE_PSB_API_BASE_URL", "https://api.9psb.com.ng/api/v1")
NINE_PSB_WEBHOOK_SECRET = os.getenv("NINE_PSB_WEBHOOK_SECRET", "")

PALMPAY_MERCHANT_ID = os.getenv("PALMPAY_MERCHANT_ID")
PALMPAY_PUBLIC_KEY = os.getenv("PALMPAY_PUBLIC_KEY")
PALMPAY_PRIVATE_KEY = os.getenv("PALMPAY_PRIVATE_KEY")
PALMPAY_BASE_URL = os.getenv("PALMPAY_BASE_URL")

VTPASS_API_KEY = os.getenv("VTPASS_API_KEY", "")
VTPASS_SECRET_KEY = os.getenv("VTPASS_SECRET_KEY", "")
VTPASS_SANDBOX_URL = os.getenv("VTPASS_SANDBOX_URL", "")
VTPASS_LIVE_URL = os.getenv("VTPASS_LIVE_URL", "")

# Bonuses
REFERRER_BONUS = os.getenv("REFERRER_BONUS", "200.00")
NEW_USER_BONUS = os.getenv("NEW_USER_BONUS", "100.00")
NON_REFERRED_BONUS = os.getenv("NON_REFERRED_BONUS", "0.00")

# TON
TON_SEQNO_CHECK_INTERVAL = int(os.getenv("TON_SEQNO_CHECK_INTERVAL", "10"))
TON_SEQNO_MAX_ATTEMPTS = int(os.getenv("TON_SEQNO_MAX_ATTEMPTS", "5"))

# --------------------------------------------------
# 16. DEFAULT AUTO FIELD
# --------------------------------------------------
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

