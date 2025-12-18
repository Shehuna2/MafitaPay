# rewards/engine.py
from decimal import Decimal
import hashlib
import json
import logging
from django.db import transaction
from django.utils import timezone

from .models import Bonus, BonusType
from .services import BonusService

logger = logging.getLogger(__name__)


def _make_signature(bonus_type_id, user_id, event, context: dict):
    """
    Create a deterministic signature for an awarding event so we can ensure idempotency.
    context should contain stable values for the event, e.g. referee_id, tx_id, deposit_id, amount.
    """
    payload = {
        "bonus_type_id": str(bonus_type_id),
        "user_id": str(user_id),
        "event": str(event),
        "context": context or {},
    }
    raw = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _extract_object_attributes(key, obj, User):
    """
    Helper function to extract attributes from an object for JSON serialization.
    
    Args:
        key: The key name for this object in the context
        obj: The object to extract attributes from
        User: The User model class
        
    Returns:
        Dictionary with extracted attributes
    """
    result = {}
    
    # Extract ID
    if hasattr(obj, 'id'):
        result[key] = str(obj.id)
    else:
        result[key] = str(obj)
        return result
    
    # Extract email for User models or any object with email attribute
    if hasattr(obj, 'email') and obj.email:
        result[f"{key}_email"] = obj.email
    
    # Extract reference if available (for WalletTransaction)
    if hasattr(obj, 'reference') and obj.reference:
        result[f"{key}_reference"] = obj.reference
    
    # Extract category if available (for WalletTransaction)
    if hasattr(obj, 'category') and obj.category:
        result[f"{key}_category"] = obj.category
    
    return result


def _sanitize_value(value, User):
    """
    Sanitize a single value for JSON serialization.
    
    Args:
        value: The value to sanitize
        User: The User model class
        
    Returns:
        JSON-serializable value
    """
    from django.db import models
    
    if value is None:
        return None
    elif isinstance(value, (str, int, float, bool)):
        return value
    elif isinstance(value, Decimal):
        return str(value)
    elif isinstance(value, dict):
        return _sanitize_context_for_json(value)
    elif isinstance(value, (list, tuple)):
        return [_sanitize_value(item, User) for item in value]
    elif isinstance(value, models.Model) or hasattr(value, '__dict__'):
        # Handle Django models and any object with attributes
        return str(value.id) if hasattr(value, 'id') else str(value)
    else:
        # Final fallback to string representation
        return str(value)


def _sanitize_context_for_json(context: dict):
    """
    Sanitize context dictionary to ensure all values are JSON serializable.
    Converts Django model instances to their string representations (IDs or references).
    
    Args:
        context: Dictionary that may contain Django model instances
        
    Returns:
        Dictionary with all values converted to JSON-serializable types
    """
    from django.db import models
    from django.contrib.auth import get_user_model
    
    User = get_user_model()
    sanitized = {}
    
    for key, value in context.items():
        if isinstance(value, models.Model) or (hasattr(value, '__dict__') and hasattr(value, 'id')):
            # Extract detailed attributes for objects with IDs
            sanitized.update(_extract_object_attributes(key, value, User))
        else:
            # Use simple sanitization for other types
            sanitized[key] = _sanitize_value(value, User)
    
    return sanitized


class RewardEngine:
    """
    Central engine responsible for creating Bonus records (and letting BonusService apply them).
    API:
      RewardEngine.credit(user, bonus_type, amount, metadata=None, referee=None, rules=None, event=None, context=None)
    """

    @staticmethod
    def credit(user, bonus_type: BonusType, amount, *,
               metadata: dict = None,
               referee=None,
               rules: dict = None,
               event: str = None,
               context: dict = None):
        """
        Credit bonuses in an idempotent, auditable way.

        Arguments:
          user: the user to receive the bonus (for referral event this is often the referrer)
          bonus_type: BonusType instance
          amount: Decimal or numeric
          metadata: extra metadata dict
          referee: optional User object (when awarding referral for both sides)
          rules: default_rules dict from BonusType (optional)
          event: string event name (e.g. 'referee_deposit_and_tx', 'deposit_made', 'registration')
          context: extra context used to generate idempotency signature (e.g. {"referee_id": "...", "deposit_id": "...", "tx_id": "..."})
        Returns:
          dict: {"created": [Bonus,...], "existing": [Bonus,...]} or raises on severe failure.
        """
        metadata = metadata or {}
        rules = rules or getattr(bonus_type, "default_rules", {}) or {}
        context = context or {}

        # Normalize amount to Decimal
        try:
            amount = Decimal(str(amount))
        except Exception:
            logger.exception("Invalid amount provided to RewardEngine.credit: %s", amount)
            return {"created": [], "existing": []}

        if amount <= 0:
            logger.info("RewardEngine.credit skipping zero/negative amount for user %s", getattr(user, "id", None))
            return {"created": [], "existing": []}

        created = []
        existing = []

        # Primary signature for awarding to THIS user
        signature_context = dict(context)
        if referee:
            signature_context["referee_id"] = str(getattr(referee, "id", referee))
        
        # Sanitize the context to ensure it's JSON serializable
        sanitized_context = _sanitize_context_for_json(signature_context)
        
        signature = _make_signature(bonus_type_id=bonus_type.id, user_id=user.id, event=event or "manual", context=sanitized_context)

        # metadata to store (always include signature)
        base_metadata = {
            **(metadata or {}),
            "trigger_signature": signature,
            "trigger_event": event or "manual",
            "trigger_context": sanitized_context,
            "awarded_at": timezone.now().isoformat(),
            "awarded_by": "system",
        }

        try:
            # Idempotency check — if a Bonus with this signature already exists for this user, skip create.
            existing_bonus = Bonus.objects.filter(user=user, bonus_type=bonus_type, metadata__trigger_signature=signature).first()
            if existing_bonus:
                logger.info("RewardEngine.credit: existing bonus found for signature %s user %s", signature, user.id)
                existing.append(existing_bonus)
            else:
                # Create primary bonus for 'user'
                locked = bool(rules.get("locked", True))
                # allow override per-rule for explicit referrer/referee amounts later
                b = BonusService.create_bonus(
                    user=user,
                    bonus_type=bonus_type,
                    amount=amount,
                    description=f"{bonus_type.display_name or bonus_type.name} reward",
                    locked=locked,
                    metadata=base_metadata
                )
                created.append(b)
                logger.info("RewardEngine.credit: created bonus %s for user %s amount=%s", b.id, user.id, amount)

            # Referral: optionally create bonus for referee as well
            if referee and rules.get("give_referee", False):
                # Determine referee amount override
                referee_amount = rules.get("referee_amount")
                r_amount = Decimal(str(referee_amount)) if referee_amount is not None else amount

                # signature for referee award should include referee id + role
                ref_sig_ctx = dict(sanitized_context)
                ref_sig_ctx["role"] = "referee"
                ref_signature = _make_signature(bonus_type_id=bonus_type.id, user_id=referee.id, event=event or "manual", context=ref_sig_ctx)

                existing_ref = Bonus.objects.filter(user=referee, bonus_type=bonus_type, metadata__trigger_signature=ref_signature).first()
                if existing_ref:
                    existing.append(existing_ref)
                else:
                    ref_meta = {
                        **base_metadata,
                        "role": "referee",
                        "trigger_signature": ref_signature,
                    }
                    ref_locked = bool(rules.get("locked", True))
                    br = BonusService.create_bonus(
                        user=referee,
                        bonus_type=bonus_type,
                        amount=r_amount,
                        description=f"{bonus_type.display_name or bonus_type.name} reward (referee)",
                        locked=ref_locked,
                        metadata=ref_meta
                    )
                    created.append(br)
                    logger.info("RewardEngine.credit: created referee bonus %s for user %s amount=%s", br.id, referee.id, r_amount)

            # If rules require giving referrer (and referee passed in), create for referrer too (if not the same user)
            if referee and rules.get("give_referrer", True):
                # This call is usually redundant when user argument is referrer; but we support cases where
                # RewardTriggerEngine.fire might call credit for referrer separately. So we guard:
                if user.id != getattr(referee, "id", None):
                    referrer_amount = rules.get("referrer_amount")
                    rr_amount = Decimal(str(referrer_amount)) if referrer_amount is not None else amount

                    referrer_sig_ctx = dict(sanitized_context)
                    referrer_sig_ctx["role"] = "referrer"
                    referrer_signature = _make_signature(bonus_type_id=bonus_type.id, user_id=user.id, event=event or "manual", context=referrer_sig_ctx)

                    existing_referrer = Bonus.objects.filter(user=user, bonus_type=bonus_type, metadata__trigger_signature=referrer_signature).first()
                    if existing_referrer:
                        existing.append(existing_referrer)
                    else:
                        referrer_meta = {
                            **base_metadata,
                            "role": "referrer",
                            "trigger_signature": referrer_signature,
                        }
                        referrer_locked = bool(rules.get("locked", True))
                        br2 = BonusService.create_bonus(
                            user=user,
                            bonus_type=bonus_type,
                            amount=rr_amount,
                            description=f"{bonus_type.display_name or bonus_type.name} reward (referrer)",
                            locked=referrer_locked,
                            metadata=referrer_meta
                        )
                        created.append(br2)
                        logger.info("RewardEngine.credit: created referrer bonus %s for user %s amount=%s", br2.id, user.id, rr_amount)

        except Exception as exc:
            logger.exception("RewardEngine.credit error: bonus_type=%s user=%s amount=%s error=%s",
                             getattr(bonus_type, "id", None), getattr(user, "id", None), str(amount), exc)

        return {"created": created, "existing": existing}
