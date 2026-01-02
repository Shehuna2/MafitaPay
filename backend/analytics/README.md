# Analytics Dashboard Backend

## Overview
The Analytics Dashboard provides comprehensive CEO-level insights into the MafitaPay platform without requiring external dependencies like Redis. This lean, startup-friendly implementation uses only built-in Django features.

## Features

### API Endpoints
All endpoints require admin authentication and are accessible at `/api/analytics/`:

1. **Dashboard Overview** - `GET /api/analytics/dashboard/overview/`
   - Quick snapshot of platform metrics
   - User growth, wallet balances, transaction volume
   - Revenue, P2P, and crypto statistics
   - Query params: `?days=30` (default: 30 days)

2. **Transaction Analytics** - `GET /api/analytics/transactions/`
   - Transaction breakdown by category and type
   - Daily transaction trends
   - Success rate analysis
   - Query params: `?days=30`

3. **Revenue Analytics** - `GET /api/analytics/revenue/`
   - Revenue breakdown by source (deposits, P2P, crypto)
   - Monthly revenue trends
   - Percentage distribution
   - Query params: `?days=30`

4. **User Analytics** - `GET /api/analytics/users/`
   - Total users, new users, verified users
   - Active user metrics
   - Daily registration trends
   - User engagement metrics
   - Query params: `?days=30`

5. **Service Analytics** - `GET /api/analytics/services/`
   - P2P trading performance
   - Crypto purchase analytics by network
   - Bills payment metrics (airtime/data)
   - Query params: `?days=30`

6. **KPIs** - `GET /api/analytics/kpis/`
   - Total platform value
   - Transaction success rate
   - Customer lifetime value (CLV)
   - User retention rate
   - Bonus distribution and utilization
   - Query params: `?days=30`

7. **Report Export** - `GET /api/analytics/reports/export/`
   - Export data as CSV or JSON
   - Query params:
     - `?type=transactions` or `?type=users`
     - `?format=csv` or `?format=json` (default: json)
     - `?days=30`

## Technical Implementation

### No External Dependencies
- **No Redis required** - Uses Django's built-in database cache
- **No Celery required** - All queries run on-demand with caching
- **Startup-friendly** - Zero additional infrastructure costs

### Caching Strategy
- Uses Django's database cache backend (`django.core.cache.backends.db.DatabaseCache`)
- Default cache duration: 5 minutes
- Cache table: `analytics_cache_table`
- Configurable cache size: 1000 entries max

### Query Optimization
- Database aggregation using `COUNT()`, `SUM()`, `AVG()`, `GROUP BY`
- Django ORM `.aggregate()` and `.annotate()` for efficient queries
- `.select_related()` and `.prefetch_related()` to avoid N+1 queries
- Database indexes on frequently queried fields
- Date range filters to limit query scope

### Database Indexes
The following indexes are created for optimal performance:

```sql
-- WalletTransaction indexes
CREATE INDEX idx_wallet_tx_created_status ON wallet_wallettransaction(created_at, status);
CREATE INDEX idx_wallet_tx_category_status ON wallet_wallettransaction(category, status);
CREATE INDEX idx_wallet_tx_type_status ON wallet_wallettransaction(tx_type, status);

-- User indexes
CREATE INDEX idx_user_date_joined ON accounts_user(date_joined);
CREATE INDEX idx_user_verified ON accounts_user(is_email_verified);

-- P2P indexes
CREATE INDEX idx_p2p_deposit_created_status ON p2p_depositorder(created_at, status);

-- Crypto indexes
CREATE INDEX idx_crypto_created_status ON gasfee_cryptopurchase(created_at, status);

-- Bonus indexes
CREATE INDEX idx_bonus_created_status ON rewards_bonus(created_at, status);
```

To create indexes, run:
```bash
python manage.py create_analytics_indexes
```

## Setup Instructions

### 1. Create Cache Table
```bash
python manage.py createcachetable
```

### 2. Run Migrations
```bash
python manage.py migrate
```

### 3. Create Analytics Indexes (Optional but Recommended)
```bash
python manage.py create_analytics_indexes
```

### 4. Test Endpoints
```bash
# Login as admin and get JWT token
# Then test endpoints:
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/analytics/dashboard/overview/?days=30
```

## Scaling to Redis (Future)

When the platform grows and you need distributed caching, switching to Redis is simple:

### 1. Install Redis
```bash
pip install redis django-redis
```

### 2. Update settings.py
```python
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://127.0.0.1:6379/1",
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        }
    }
}
```

### 3. No Code Changes Required!
All analytics views use Django's cache framework, so the code works with both database cache and Redis without modifications.

## Data Sources

The analytics system aggregates data from:
- `accounts.User` - user metrics
- `wallet.Wallet` - balance metrics
- `wallet.WalletTransaction` - transaction records
- `p2p.DepositOrder` - P2P trading
- `gasfee.CryptoPurchase` - crypto purchases
- `rewards.Bonus` - bonus/rewards distribution

## Performance Considerations

### Current Implementation (Database Cache)
- ✅ Zero infrastructure cost
- ✅ Suitable for small to medium traffic
- ✅ Easy to maintain and debug
- ⚠️ Cache stored in database (minimal overhead)

### When to Upgrade to Redis
Consider Redis when:
- Platform handles >1000 requests/minute
- You need distributed caching across multiple servers
- Response times become slow even with caching
- You need advanced cache features (TTL, pub/sub)

## Security
- All endpoints require `IsAuthenticated` and `IsAdminUser` permissions
- Only superuser/admin accounts can access analytics
- Query results are cached per parameter combination
- Export endpoints limit to 1000 records to prevent abuse

## Monitoring
- All errors are logged to Django's logging system
- Check logs for analytics view errors:
  ```bash
  # View logs in production
  tail -f /var/log/django.log | grep analytics
  ```

## Example Response

### Dashboard Overview
```json
{
  "period_days": 30,
  "users": {
    "total": 1250,
    "new": 85,
    "growth_rate": 7.31
  },
  "wallet": {
    "total_balance": 5420000.00,
    "total_locked": 125000.00,
    "available_balance": 5295000.00
  },
  "transactions": {
    "total_volume": 8450000.00,
    "total_count": 4521,
    "average_transaction": 1869.25
  },
  "revenue": {
    "total": 2100000.00,
    "daily_average": 70000.00
  },
  "p2p": {
    "orders": 342,
    "volume": 1250000.00
  },
  "crypto": {
    "purchases": 89,
    "volume": 450000.00
  },
  "generated_at": "2026-01-02T12:00:00Z"
}
```

## Troubleshooting

### Cache not working
```bash
# Verify cache table exists
python manage.py shell
>>> from django.core.cache import cache
>>> cache.set('test', 'value', 60)
>>> cache.get('test')
'value'
```

### Slow queries
```bash
# Check if indexes are created
python manage.py create_analytics_indexes

# Clear cache to test fresh queries
python manage.py shell
>>> from django.core.cache import cache
>>> cache.clear()
```

### Permission denied
- Ensure user is superuser: `user.is_superuser = True`
- Check user has staff status: `user.is_staff = True`

## Support
For issues or questions, contact the development team.
