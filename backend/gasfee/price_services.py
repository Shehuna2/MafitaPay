import time
import logging
import threading
import requests
from decimal import Decimal
from django.core.cache import cache
from tenacity import retry, wait_exponential, stop_after_attempt

logger = logging.getLogger(__name__)

# ======================================================
#               GLOBAL RATE LIMIT (Redis-safe)
# ======================================================

LOCK = threading.Lock()
MIN_INTERVAL = 4  # seconds – for CoinGecko free tier
RATE_LIMIT_KEY = "cg_last_call_ts"  # stored in Redis or cache backend


def rate_limited_request(url, params=None, timeout=5):
    """
    Enforces API rate limit ACROSS all workers/processes.
    """
    with LOCK:
        last_ts = cache.get(RATE_LIMIT_KEY, 0)
        elapsed = time.time() - last_ts

        if elapsed < MIN_INTERVAL:
            sleep_for = MIN_INTERVAL - elapsed
            logger.debug(f"[CG] Sleeping {sleep_for:.2f}s due to global rate limit")
            time.sleep(sleep_for)

        resp = requests.get(url, params=params, timeout=timeout)
        cache.set(RATE_LIMIT_KEY, time.time(), MIN_INTERVAL * 2)

    resp.raise_for_status()
    return resp


# ======================================================
#                  COINGECKO FETCH (RETRY)
# ======================================================

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=4))
def fetch_from_coingecko(asset_ids, currency="usd"):
    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {"ids": ",".join(asset_ids), "vs_currencies": currency}

    logger.info(f"[CG] Fetching: {params}")
    resp = rate_limited_request(url, params=params)
    return resp.json()


# ======================================================
#                   BINANCE FALLBACK
# ======================================================

BINANCE_MAPPING = {
    "ethereum": "ETHUSDT",
    "binancecoin": "BNBUSDT",
    "solana": "SOLUSDT",
    "tether": "USDTUSDT",
    "near": "NEARUSDT",
    "bitcoin": "BTCUSDT",
}


def fetch_from_binance(asset_id):
    try:
        symbol = BINANCE_MAPPING.get(asset_id.lower())
        if not symbol:
            return None

        url = f"https://api.binance.com/api/v3/ticker/price?symbol={symbol}"
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()

        return Decimal(resp.json()["price"])
    except Exception:
        return None


# ======================================================
#           UNIFIED FETCH — INDIVIDUAL CACHES
# ======================================================

def get_crypto_prices_in_usd(asset_ids):
    """
    Returns { "bitcoin": Decimal("91000"), ... } for each asset.
    Uses:
      - Cache per asset (avoids duplicate CG calls)
      - Bulk CG request per call (efficient)
      - Per-asset fallback to Binance
      - Per-asset last-good fallback
    """

    # Step 1 — separate assets that need fresh fetch
    prices = {}
    to_fetch = []

    for asset in asset_ids:
        cache_key = f"cg_usd_{asset}"
        cached_price = cache.get(cache_key)

        if cached_price:
            prices[asset] = cached_price
        else:
            to_fetch.append(asset)

    # Nothing new to fetch → return cached only
    if not to_fetch:
        return prices

    # Step 2 — try batch fetch from CoinGecko
    try:
        cg_response = fetch_from_coingecko(to_fetch, "usd")

        for asset in to_fetch:
            price = cg_response.get(asset, {}).get("usd")
            if price is not None:
                price_decimal = Decimal(str(price))
                prices[asset] = price_decimal

                # Set fresh cache (30s TTL)
                cache.set(f"cg_usd_{asset}", price_decimal, 30)
                cache.set(f"cg_usd_backup_{asset}", price_decimal, None)
            else:
                # CoinGecko missing this asset → use fallback
                fallback = fetch_from_binance(asset) or cache.get(f"cg_usd_backup_{asset}")
                prices[asset] = fallback or Decimal("0")

    except Exception as e:
        logger.error(f"[CG] Multi-fetch failed: {e}")

        # Step 3 — fallback for all missing via Binance + last-good
        for asset in to_fetch:
            fallback_price = (
                fetch_from_binance(asset) or
                cache.get(f"cg_usd_backup_{asset}") or
                Decimal("0")
            )
            prices[asset] = fallback_price

    return prices


# ======================================================
#                  USD → NGN RATE
# ======================================================

def get_usd_ngn_rate(margin_type="buy"):
    """
    Uses CoinGecko (tether/ngn) with:
      - fresh cache (5 minutes)
      - full backup fallback
      - DB margin adjustment
    """

    fresh_key = "usd_ngn_rate_fresh"
    backup_key = "usd_ngn_rate_backup"

    cached = cache.get(fresh_key)
    if cached:
        return apply_fx_margin(cached, margin_type)

    try:
        cg = fetch_from_coingecko(["tether"], "ngn")
        base_rate = Decimal(str(cg["tether"]["ngn"]))

        cache.set(fresh_key, base_rate, 300)
        cache.set(backup_key, base_rate, None)

    except Exception as e:
        logger.error(f"[FX] USD→NGN failed: {e}")
        base_rate = cache.get(backup_key) or Decimal("1500")

    return apply_fx_margin(base_rate, margin_type)


# Margin helper
def apply_fx_margin(rate, margin_type):
    try:
        from .models import ExchangeRateMargin
        margin = ExchangeRateMargin.objects.get(
            currency_pair="USDT/NGN",
            margin_type=margin_type
        ).profit_margin
    except Exception:
        margin = Decimal("0")

    final_rate = rate + margin
    logger.info(f"[FX] NGN rate({margin_type}): base={rate} margin={margin} final={final_rate}")
    return final_rate
