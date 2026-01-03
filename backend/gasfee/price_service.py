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
MIN_INTERVAL = 4  # seconds – CoinGecko free tier limit
RATE_LIMIT_KEY = "cg_last_call_ts"  # shared across workers


def rate_limited_request(url, params=None, timeout=5):
    """
    Enforces API rate limit ACROSS all workers/processes.
    Sleeps OUTSIDE the lock to avoid blocking other threads.
    """
    while True:
        sleep_for = None
        with LOCK:
            last_ts = cache.get(RATE_LIMIT_KEY, 0)
            elapsed = time.time() - last_ts

            if elapsed >= MIN_INTERVAL:
                # We can proceed with the request
                resp = requests.get(url, params=params, timeout=timeout)
                cache.set(RATE_LIMIT_KEY, time.time(), MIN_INTERVAL * 2)
                break
            else:
                # Calculate sleep time
                sleep_for = MIN_INTERVAL - elapsed
        
        # Sleep OUTSIDE the lock (only if needed)
        if sleep_for is not None:
            logger.debug(f"[CG] Sleeping {sleep_for:.2f}s due to global rate limit")
            time.sleep(sleep_for)

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

SAFE_FALLBACK_NON_STABLE = Decimal("0.25")   # minimal safe fallback
SAFE_FALLBACK_STABLE = Decimal("1")          # stablecoins always = $1


def get_safe_fallback_price(asset_id):
    """
    Returns a safe fallback price that is NEVER zero.
    Stablecoins → always 1
    Others → a minimal neutral fallback (0.25)
    """

    stable_ids = {"tether", "usdt", "usd-coin", "usdc"}

    if asset_id.lower() in stable_ids:
        return SAFE_FALLBACK_STABLE

    return SAFE_FALLBACK_NON_STABLE



def get_crypto_prices_in_usd(asset_ids):
    """
    Returns { "bitcoin": Decimal("91000"), ... }
    with:
      - global rate limit
      - CoinGecko batch fetch
      - Binance fallback
      - backup cache
      - safe minimal fallback
    NEVER returns Decimal("0").
    """

    prices = {}
    to_fetch = []

    # ------------------------------------------------------
    # 1. Check fresh Redis cache
    # ------------------------------------------------------
    for asset in asset_ids:
        cache_key = f"cg_usd_{asset}"
        cached = cache.get(cache_key)

        if cached:
            prices[asset] = cached
        else:
            to_fetch.append(asset)

    if not to_fetch:
        return prices

    # ------------------------------------------------------
    # 2. Try CoinGecko batch request
    # ------------------------------------------------------
    try:
        cg_response = fetch_from_coingecko(to_fetch, "usd")

        for asset in to_fetch:
            raw_price = cg_response.get(asset, {}).get("usd")

            if raw_price is not None:
                price_dec = Decimal(str(raw_price))

                if price_dec > 0:
                    prices[asset] = price_dec

                    # cache fresh & backup
                    cache.set(f"cg_usd_{asset}", price_dec, 30)
                    cache.set(f"cg_usd_backup_{asset}", price_dec, None)
                    continue

            # otherwise: fall back
            binance_fallback = fetch_from_binance(asset)
            backup = cache.get(f"cg_usd_backup_{asset}")
            safe_fallback = get_safe_fallback_price(asset)

            prices[asset] = (
                binance_fallback
                or backup
                or safe_fallback
            )

    except Exception as e:
        logger.error(f"[CG] Multi-fetch failed: {e}")

        # ------------------------------------------------------
        # 3. If CoinGecko batch fails, fallback per asset
        # ------------------------------------------------------
        for asset in to_fetch:
            binance_fallback = fetch_from_binance(asset)
            backup = cache.get(f"cg_usd_backup_{asset}")
            safe_fallback = get_safe_fallback_price(asset)

            prices[asset] = (
                binance_fallback
                or backup
                or safe_fallback
            )

    return prices


# ======================================================
#                  USD → NGN RATE
# ======================================================

SAFE_FX_FALLBACK = Decimal("1500")   # absolute fallback when everything fails
MIN_VALID_RATE = Decimal("200")      # enforce minimum to avoid invalid 0 or tiny rates


def get_usd_ngn_rate_raw():
    """
    Gets RAW USD→NGN from CoinGecko (tether/ngn).
    With:
      - exponential retry from fetch_from_coingecko
      - caching
      - backup cache
      - safe fallback when everything fails
    ALWAYS returns a rate > 0.
    """

    fresh_key = "usd_ngn_rate_fresh"
    backup_key = "usd_ngn_rate_backup"

    # Use cached 5-minute rate if available
    cached = cache.get(fresh_key)
    if cached:
        try:
            if Decimal(cached) > 0:
                return Decimal(cached)
        except Exception:
            pass

    try:
        # Fetch "tether" → NGN, safest USD pair
        cg = fetch_from_coingecko(["tether"], "ngn")
        raw = Decimal(str(cg["tether"]["ngn"]))

        # sanity check
        if raw <= 0:
            raise ValueError("CoinGecko returned INVALID FX rate")

        # store fresh + backup
        cache.set(fresh_key, raw, 300)
        cache.set(backup_key, raw, None)

        return raw

    except Exception as e:
        logger.error(f"[FX] USD→NGN fetch failed: {e}")

        # fallback to backup or last resort fallback
        backup = cache.get(backup_key)
        if backup:
            try:
                backup_dec = Decimal(backup)
                if backup_dec > 0:
                    return backup_dec
            except:
                pass

        # absolute last fallback
        logger.warning(
            f"[FX] Using SAFE USD→NGN fallback: {SAFE_FX_FALLBACK}"
        )
        return SAFE_FX_FALLBACK



def get_usd_ngn_rate_with_margin(margin_type: str):
    """
    Applies SELL or BUY margin safely.
    Ensures the final rate is NEVER zero or negative.
    """

    raw_rate = get_usd_ngn_rate_raw()

    # fetch margin from DB
    try:
        from .models import ExchangeRateMargin
        margin_obj = ExchangeRateMargin.objects.get(
            currency_pair="USDT/NGN",
            margin_type=margin_type,
        )
        margin = Decimal(margin_obj.profit_margin)
    except Exception:
        margin = Decimal("0")

    # apply margin
    if margin_type == "sell":
        final_rate = raw_rate - margin
    else:
        final_rate = raw_rate + margin

    # Absolute safety: never return 0 or negative
    if final_rate <= 0:
        logger.warning(
            f"[FX] Final NGN rate invalid after margin (raw={raw_rate}, margin={margin}). "
            f"Using minimum floor {MIN_VALID_RATE}"
        )
        final_rate = MIN_VALID_RATE

    # Logging for debugging
    logger.info(
        f"[FX] USD→NGN ({margin_type}) raw={raw_rate} margin={margin} → {final_rate}"
    )

    return final_rate

