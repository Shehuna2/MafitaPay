import os
import json
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv
import dj_database_url

# Load .env (only for local dev)
if os.getenv("RENDER") is None:
    load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("DJANGO_SECRET_KEY is required")

DEBUG = os.getenv("DJANGO_DEBUG", "False") == "True"

# ALLOWED_HOSTS
_allowed_hosts = os.getenv("ALLOWED_HOSTS", "")
ALLOWED_HOSTS = [h.strip() for h in _allowed_hosts.split(",") if h.strip()]
if not ALLOWED_HOSTS:
    raise ValueError("ALLOWED_HOSTS environment variable is required")

# Add ngrok for local dev
if DEBUG:
    ngrok_host = os.getenv("NGROK_HOST", "")
    ALLOWED_HOSTS += [h for h in ngrok_host.split(",") if h]

# Application definition
INSTALLED_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
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
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# Remove cache middleware unless you really need it
# 'django.middleware.cache.UpdateCacheMiddleware',
# 'django.middleware.cache.FetchFromCacheMiddleware',

ROOT_URLCONF = "mafitapay.urls"

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

WSGI_APPLICATION = "mafitapay.wsgi.application"
ASGI_APPLICATION = "mafitapay.asgi.application"

# Database
DATABASES = {
    "default": dj_database_url.config(
        default=os.getenv("DATABASE_URL", "sqlite:///" + str(BASE_DIR / "db.sqlite3")),
        conn_max_age=600,
        ssl_require=not DEBUG,
    )
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Internationalization
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "static"] if DEBUG else []
STATIC_ROOT = "/app/staticfiles"  # Render's persistent volume

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# CORS
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
if not CORS_ALLOWED_ORIGINS and not DEBUG:
    raise ValueError("CORS_ALLOWED_ORIGINS is required in production")

if DEBUG:
    CORS_ALLOWED_ORIGINS += [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://.*\.ngrok\.io$",
    r"^https://.*\.onrender\.com$",
]

# Security
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = not DEBUG
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_HSTS_SECONDS = 31536000 if not DEBUG else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG

# Custom User
AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = [
    "accounts.backends.EmailBackend",
    "django.contrib.auth.backends.ModelBackend",
]

# REST Framework
REST_FRAMEWORK = {
    "EXCEPTION_HANDLER": "accounts.utils.custom_exception_handler",
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
}

# JWT
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}

# Email
EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "True") == "True"
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD")
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "no-reply@mafitapay.com")

# URLs
BASE_URL = os.getenv("BASE_URL", "https://api.mafitapay.com")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://mafitapay.com")

# Redis URL (used by Celery, Channels, Cache)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# Celery
CELERY_BROKER_URL = REDIS_URL + "/0"
CELERY_RESULT_BACKEND = REDIS_URL + "/0"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_BEAT_SCHEDULE = {
    "check-sell-orders-every-minute": {
        "task": "bills.tasks.check_sell_orders",
        "schedule": 60.0,  # every minute
    },
}

# Channel Layers
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [REDIS_URL + "/2"],  # Use db 2
        },
    },
}

# Cache
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": REDIS_URL + "/1",
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        },
    }
}
CACHE_TTL = 300

# Logging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {"level": "INFO", "propagate": True},
        "p2p": {"level": "DEBUG", "handlers": ["console"], "propagate": False},
        "wallet": {"level": "INFO", "handlers": ["console"], "propagate": False},
    },
}

# Your API keys (safe to keep as-is, just ensure they're in Render env)
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