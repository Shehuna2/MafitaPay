from __future__ import annotations

from django.conf import settings

DEFAULT_CARD_DEPOSIT_PROVIDER_MAP = {
    "USD": ["flutterwave", "fincra"],
    "GBP": ["flutterwave", "fincra"],
    "EUR": ["flutterwave", "fincra"],
    "GHS": ["flutterwave", "fincra"],
    "XOF": ["flutterwave"],
    "XAF": ["flutterwave"],
}

FLUTTERWAVE_CARD_CURRENCIES = {"USD", "GBP", "EUR", "GHS", "XOF", "XAF"}


def get_card_deposit_provider_map():
    configured = getattr(settings, "CARD_DEPOSIT_PROVIDER_MAP", None)
    source = configured if isinstance(configured, dict) else DEFAULT_CARD_DEPOSIT_PROVIDER_MAP

    normalized = {}
    for currency, providers in source.items():
        code = str(currency).upper().strip()
        provider_list = []
        for provider in providers or []:
            p = str(provider).lower().strip()
            if p and p not in provider_list:
                provider_list.append(p)
        if code and provider_list:
            normalized[code] = provider_list

    return normalized


def get_supported_card_currencies():
    return sorted(get_card_deposit_provider_map().keys())


def get_supported_card_providers():
    providers = set()
    for plist in get_card_deposit_provider_map().values():
        providers.update(plist)
    return sorted(providers)


def get_allowed_providers_for_currency(currency: str):
    return get_card_deposit_provider_map().get(str(currency).upper().strip(), [])


def is_provider_allowed_for_currency(currency: str, provider: str):
    return str(provider).lower().strip() in get_allowed_providers_for_currency(currency)
