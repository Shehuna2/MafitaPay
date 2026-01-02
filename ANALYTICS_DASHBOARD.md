# CEO Analytics Dashboard - Quick Start Guide

## Overview
The MafitaPay Analytics Dashboard provides real-time insights into platform performance without requiring external dependencies like Redis. This lean implementation is optimized for startup costs on Render.

## Features
✅ **Zero external dependencies** - Uses only built-in Django features  
✅ **Database-backed caching** - No Redis required (can add later)  
✅ **7 REST API endpoints** - Complete analytics coverage  
✅ **Query optimization** - Aggregation, indexes, and caching  
✅ **Admin-only access** - Secure by default  
✅ **Export capabilities** - CSV and JSON formats  

## API Endpoints

All endpoints require admin authentication via JWT token.

### 1. Dashboard Overview
```
GET /api/analytics/dashboard/overview/?days=30
```
Returns: User metrics, wallet balances, transaction volume, revenue, P2P, and crypto stats.

### 2. Transaction Analytics
```
GET /api/analytics/transactions/?days=30
```
Returns: Transaction breakdown by category, type, daily trends, and success rates.

### 3. Revenue Analytics
```
GET /api/analytics/revenue/?days=30
```
Returns: Revenue by source (deposits, P2P, crypto), monthly trends, and percentages.

### 4. User Analytics
```
GET /api/analytics/users/?days=30
```
Returns: Total users, active users, verification rates, and registration trends.

### 5. Service Analytics
```
GET /api/analytics/services/?days=30
```
Returns: P2P performance, crypto purchases by network, and bill payments.

### 6. Key Performance Indicators (KPIs)
```
GET /api/analytics/kpis/?days=30
```
Returns: Platform value, success rates, CLV, retention, and bonus utilization.

### 7. Report Export
```
GET /api/analytics/reports/export/?type=transactions&format=json&days=30
GET /api/analytics/reports/export/?type=users&format=csv&days=30
```
Returns: Exportable reports in JSON or CSV format.

## Setup Instructions

### 1. Install Dependencies (Already Included)
All required packages are already in `requirements.txt`. No additional installations needed.

### 2. Create Database Cache Table
```bash
cd backend
python manage.py createcachetable
```

### 3. Run Migrations
```bash
python manage.py migrate
```

### 4. Create Analytics Indexes (Recommended)
```bash
python manage.py create_analytics_indexes
```
This creates database indexes for optimal query performance.

### 5. Verify Installation
```bash
python manage.py test analytics
```
All 12 tests should pass.

## Usage Example

### Get JWT Token
```bash
curl -X POST http://localhost:8000/api/token/ \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your_password"}'
```

### Call Analytics Endpoint
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  "http://localhost:8000/api/analytics/dashboard/overview/?days=30"
```

### Example Response
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

## Performance Optimizations

### 1. Database Caching
- Cache duration: 5 minutes (configurable)
- Cache table: `analytics_cache_table`
- Max entries: 1000
- Auto-culling when limit reached

### 2. Database Indexes
The following indexes are created for optimal performance:
- `wallet_wallettransaction` (created_at, status)
- `wallet_wallettransaction` (category, status)
- `wallet_wallettransaction` (tx_type, status)
- `accounts_user` (date_joined)
- `accounts_user` (is_email_verified)
- `p2p_depositorder` (created_at, status)
- `gasfee_cryptopurchase` (created_at, status)
- `rewards_bonus` (created_at, status)

### 3. Query Optimization
- Uses `aggregate()` and `annotate()` for database-level calculations
- `select_related()` and `prefetch_related()` to avoid N+1 queries
- Date range filters to limit data scope
- Efficient grouping with `TruncDate` and `TruncMonth`

## Scaling to Redis (Future)

When your platform grows, you can easily switch to Redis:

### 1. Install Redis
```bash
pip install redis django-redis
```

### 2. Update `settings.py`
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

### 3. No Code Changes Needed!
All analytics views use Django's cache framework, so they work with both database cache and Redis.

## Security

- ✅ All endpoints require `IsAuthenticated` permission
- ✅ All endpoints require `IsAdminUser` permission
- ✅ Only superusers can access analytics
- ✅ Export endpoints limit to 1000 records
- ✅ All queries use date filters to prevent unbounded data access
- ✅ SQL injection protected by Django ORM

## Cost Analysis

### Current Setup (Database Cache)
- **Infrastructure Cost**: $0 extra
- **Suitable For**: 0-1000 requests/minute
- **Cache Storage**: Uses existing database

### With Redis (Future)
- **Infrastructure Cost**: ~$7-15/month (Render Redis instance)
- **Suitable For**: 1000+ requests/minute
- **Cache Storage**: Separate Redis instance
- **Benefits**: Distributed caching, better performance at scale

## Monitoring

### Check Cache Performance
```bash
python manage.py shell
>>> from django.core.cache import cache
>>> cache.set('test', 'value', 60)
>>> cache.get('test')
'value'
```

### View Analytics Logs
```bash
# In production
tail -f /var/log/django.log | grep analytics

# In development
# Check console output for analytics-related logs
```

### Clear Cache
```bash
python manage.py shell
>>> from django.core.cache import cache
>>> cache.clear()
```

## Troubleshooting

### Issue: Slow Queries
**Solution**: Run `python manage.py create_analytics_indexes`

### Issue: Cache Not Working
**Solution**: Verify cache table exists with `python manage.py createcachetable`

### Issue: Permission Denied
**Solution**: Ensure user has `is_superuser=True` and `is_staff=True`

### Issue: 500 Error on Endpoints
**Solution**: Check logs for specific errors, ensure all migrations are applied

## Files Structure

```
backend/analytics/
├── __init__.py
├── admin.py
├── apps.py
├── models.py                  # Empty (using aggregation, not storing data)
├── views.py                   # All 7 endpoint implementations
├── urls.py                    # URL routing
├── tests.py                   # 12 test cases
├── README.md                  # Detailed documentation
├── management/
│   └── commands/
│       └── create_analytics_indexes.py  # Index creation command
└── migrations/
    └── __init__.py
```

## Support

For issues or questions:
1. Check logs for error details
2. Run tests: `python manage.py test analytics`
3. Verify indexes: `python manage.py create_analytics_indexes`
4. Contact development team

## Future Enhancements

When scaling:
- [ ] Add Redis for distributed caching
- [ ] Implement Celery for async report generation
- [ ] Add more granular metrics (hourly, weekly)
- [ ] Create scheduled reports via email
- [ ] Add data visualization endpoints
- [ ] Implement role-based access (not just admin)
- [ ] Add webhook notifications for KPI thresholds

---

**Built with ❤️ for MafitaPay - Lean, scalable, and cost-effective analytics**
