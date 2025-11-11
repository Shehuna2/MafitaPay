import os
import json
from pathlib import Path
from dotenv import load_dotenv
import dj_database_url
from datetime import timedelta

# --------------------------------------------------
# 1. ENVIRONMENT DETECTION
# --------------------------------------------------
ON_RENDER = os.getenv("RENDER") == "true"
if not ON_RENDER and Path(".env").exists():
    load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# --------------------------------------------------
# 2. DEBUG
# --------------------------------------------------
DEBUG = os.getenv("DJANGO_DEBUG", "True" if not ON_RENDER else "False").lower() == "true"

# --------------------------------------------------
# 3. SECRET KEY
# --------------------------------------------------
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = os.getenv("DJANGO_TEST_KEY", "django-insecure-local-fallback")
    else:
        raise ValueError("DJANGO_SECRET_KEY required in production")

# --------------------------------------------------
# 4. HOSTS
# --------------------------------------------------
ALLOWED_HOSTS = [h.strip() for h in os.getenv("ALLOWED_HOSTS", "").split(",") if h.strip()]
if DEBUG:
    ALLOWED_HOSTS += ["localhost", "127.0.0.1"]
if not ALLOWED_HOSTS and not DEBUG:
    raise ValueError("ALLOWED_HOSTS required in production")

# --------------------------------------------------
# 5. DATABASE (smart switch)
# --------------------------------------------------
if DEBUG and not ON_RENDER:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    DATABASES = {
        "default": dj_database_url.parse(
            os.environ.get("DATABASE_URL"),
            conn_max_age=60,
            ssl_require=True,
        )
    }

# --------------------------------------------------
# 6. EMAIL (smart switch)
# --------------------------------------------------
if DEBUG:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
else:
    EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")

EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.sendgrid.net")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "True") == "True"
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD")
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "MafitaPay <no-reply@mafitapay.com>")

# --------------------------------------------------
# 7. URLS
# --------------------------------------------------
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
BACKEND_URL = os.getenv("BACKEND_URL", BASE_URL)

# --------------------------------------------------
# 8. SECURITY
# --------------------------------------------------
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = not DEBUG
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_HSTS_SECONDS = 31536000 if not DEBUG else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG

# --------------------------------------------------
# 9. CORS — FINAL FIX
# --------------------------------------------------
CORS_ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",") if o.strip()
]
if DEBUG:
    CORS_ALLOWED_ORIGINS += ["http://localhost:5173", "http://127.0.0.1:5173"]

CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://.*\.onrender\.com$",
    r"^https://.*\.ngrok\.io$",
]

# ADD THESE 3 LINES ↓↓↓
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]

# --------------------------------------------------
# 10. STATIC / MEDIA
# --------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = "/tmp/staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

MEDIA_URL = "/media/"
if not DEBUG:
    DEFAULT_FILE_STORAGE = "cloudinary_storage.storage.MediaCloudinaryStorage"
    CLOUDINARY_URL = f"cloudinary://{os.getenv('CLOUDINARY_API_KEY')}:{os.getenv('CLOUDINARY_API_SECRET')}@{os.getenv('CLOUDINARY_CLOUD_NAME')}"

# --------------------------------------------------
# 11. APPS & MIDDLEWARE
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
    "cloudinary",
    "cloudinary_storage",
    "accounts",
    "referrals",
    "wallet",
    "p2p",
    "gasfee",
    "bills",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

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
# 12. AUTH & JWT
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
# 13. CHANNELS & CACHE (in-memory = zero config)
# --------------------------------------------------
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}


# --------------------------------------------------
# 15. LOGGING — SEE EVERYTHING
# --------------------------------------------------
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
        "level": "DEBUG" if DEBUG else "INFO",
    },
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "accounts": {"handlers": ["console"], "level": "DEBUG", "propagate": False},
        "wallet": {"handlers": ["console"], "level": "DEBUG", "propagate": False},
        "p2p": {"handlers": ["console"], "level": "DEBUG", "propagate": False},
        "gasfee": {"handlers": ["console"], "level": "DEBUG", "propagate": False},
        "bills": {"handlers": ["console"], "level": "DEBUG", "propagate": False},
    },
}

# --------------------------------------------------
# 14. ALL YOUR API KEYS (unchanged)
# --------------------------------------------------
BYBIT_RECEIVE_DETAILS = json.loads(os.getenv("BYBIT_RECEIVE_DETAILS", "{}"))
BITGET_RECEIVE_DETAILS = json.loads(os.getenv("BITGET_RECEIVE_DETAILS", "{}"))
MEXC_RECEIVE_DETAILS = json.loads(os.getenv("MEXC_RECEIVE_DETAILS", "{}"))
GATEIO_RECEIVE_DETAILS = json.loads(os.getenv("GATEIO_RECEIVE_DETAILS", "{}"))
BINANCE_RECEIVE_DETAILS = json.loads(os.getenv("BINANCE_RECEIVE_DETAILS", "{}"))
# EVM_RECEIVE_DETAILS = json.loads(os.getenv("EVM_RECEIVE_DETAILS", "{}"))
# SIDRA_RECEIVE_DETAILS = json.loads(os.getenv("SIDRA_RECEIVE_DETAILS", "{}"))

BINANCE_API_KEY = os.getenv("BINANCE_API_KEY")
BINANCE_API_SECRET = os.getenv("BINANCE_API_SECRET")
TONCENTER_API_KEY = os.getenv("TONCENTER_API_KEY", os.getenv("TON_API_KEY"))
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

REFERRER_BONUS = os.getenv("REFERRER_BONUS", "200.00")
NEW_USER_BONUS = os.getenv("NEW_USER_BONUS", "100.00")
NON_REFERRED_BONUS = os.getenv("NON_REFERRED_BONUS", "0.00")

TON_SEQNO_CHECK_INTERVAL = int(os.getenv("TON_SEQNO_CHECK_INTERVAL", "10"))
TON_SEQNO_MAX_ATTEMPTS = int(os.getenv("TON_SEQNO_MAX_ATTEMPTS", "5"))

# --------------------------------------------------
# 15. FINAL
# --------------------------------------------------
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"