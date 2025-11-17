# price_service.py
import time
import logging
import threading
import requests
from decimal import Decimal
from django.core.cache import cache
from tenacity import retry, wait_exponential, stop_after_attempt

logger = logging.getLogger(__name__)

# ============================================
# GLOBAL RATE LIMIT (1 request every 4 seconds)
# ============================================

LAST_REQUEST_AT = 0
LOCK = threading.Lock()
MIN_INTERVAL = 4   # seconds – safe for Coingecko free tier


def rate_limited_request(url, params=None, timeout=5):
    global LAST_REQUEST_AT

    with LOCK:
        elapsed = time.time() - LAST_REQUEST_AT
        if elapsed < MIN_INTERVAL:
            time.sleep(MIN_INTERVAL - elapsed)

        resp = requests.get(url, params=params, timeout=timeout)
        LAST_REQUEST_AT = time.time()

    resp.raise_for_status()
    return resp


# ============================================
# RETRY DECORATOR FOR COINGECKO
# ============================================

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=5))
def fetch_from_coingecko(ids: list[str], currency: str = "usd"):
    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {"ids": ",".join(ids), "vs_currencies": currency}

    logger.info(f"[CG] Fetch: {params}")
    resp = rate_limited_request(url, params=params)
    return resp.json()


# ============================================
# FALLBACK PROVIDER (BINANCE)
# ============================================

BINANCE_MAPPING = {
    "ethereum": "ETHUSDT",
    "binancecoin": "BNBUSDT",
    "solana": "SOLUSDT",
    "tether": "USDTUSDT",  # we'll skip this as USDT is stable
    "near": "NEARUSDT",
    "bitcoin": "BTCUSDT",
    # add as needed
}

def fetch_from_binance(symbol: str):
    try:
        pair = BINANCE_MAPPING.get(symbol.lower())
        if not pair:
            return None
        url = f"https://api.binance.com/api/v3/ticker/price?symbol={pair}"
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        return Decimal(resp.json()["price"])
    except Exception:
        return None


# ============================================
# UNIFIED MULTI-ASSET PRICE FETCH
# ============================================

def get_crypto_prices_in_usd(asset_ids: list[str]) -> dict:
    """
    Returns: { "bitcoin": Decimal("91000"), "solana": Decimal("195") ... }
    """

    cache_key = f"cg_multi_{'_'.join(sorted(asset_ids))}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    # Try CoinGecko
    try:
        cg = fetch_from_coingecko(asset_ids, currency="usd")
        prices = {}

        for asset in asset_ids:
            if asset in cg and "usd" in cg[asset]:
                prices[asset] = Decimal(str(cg[asset]["usd"]))
            else:
                # fallback to Binance for individual asset
                fallback_price = fetch_from_binance(asset.replace("-", ""))
                prices[asset] = fallback_price or Decimal("0")

        cache.set(cache_key, prices, 300)
        return prices

    except Exception as e:
        logger.error(f"CG Multi fetch failed: {e}")

    # If everything fails → extremely safe fallback
    return {asset: Decimal("500") for asset in asset_ids}


# ============================================
# USD → NGN RATE
# ============================================

def get_usd_ngn_rate(margin_type="buy"):
    fresh_key = "usd_ngn_rate_live"
    last_key = "usd_ngn_rate_backup"

    cached = cache.get(fresh_key)
    if cached:
        return cached

    try:
        cg = fetch_from_coingecko(["tether"], currency="ngn")
        rate = Decimal(str(cg["tether"]["ngn"]))

        cache.set(fresh_key, rate, 300)
        cache.set(last_key, rate, None)
    except Exception as e:
        logger.error(f"Failed USD→NGN fetch: {e}")
        rate = cache.get(last_key) or Decimal("1500")

    # Apply margin from DB
    try:
        from .models import ExchangeRateMargin
        margin = ExchangeRateMargin.objects.get(
            currency_pair="USDT/NGN",
            margin_type=margin_type
        ).profit_margin
    except:
        margin = Decimal("0")

    final_rate = rate + margin
    logger.info(f"USD→NGN ({margin_type}): base={rate}, margin={margin}, final={final_rate}")

    return final_rate
