# Maintenance Mode Feature

This document describes the comprehensive maintenance mode feature that allows administrators to toggle the entire system into maintenance mode without requiring a deployment.

## Overview

The maintenance mode feature provides a way to temporarily restrict access to the application while performing upgrades, fixes, or scheduled maintenance. During maintenance mode:

- Regular users see a maintenance page with a custom message
- Admin users (staff/superuser) can still access the application
- The admin panel remains fully accessible
- An API endpoint provides real-time maintenance status
- Optional countdown timer shows estimated return time

## Features

### Backend (Django)

#### 1. AppSettings Model (`backend/core/models.py`)

A singleton model that stores maintenance mode configuration:

```python
class AppSettings(models.Model):
    maintenance_enabled = BooleanField()      # Toggle maintenance on/off
    maintenance_message = CharField()         # Custom message for users
    maintenance_start_time = DateTimeField()  # When maintenance started
    maintenance_end_time = DateTimeField()    # Estimated end time
    show_countdown = BooleanField()           # Show countdown timer
```

**Key Methods:**
- `get_settings()`: Returns the singleton instance (cached)
- `is_maintenance_active()`: Quick check if maintenance is enabled

#### 2. Maintenance Middleware (`backend/core/middleware.py`)

Intercepts all incoming requests and returns 503 Service Unavailable during maintenance.

**Exempt Paths:**
- `/admin/` - Admin panel always accessible
- `/api/maintenance-status/` - Status endpoint always accessible

**Exempt Users:**
- Staff users (`is_staff=True`)
- Superusers (`is_superuser=True`)

#### 3. Admin Interface (`backend/core/admin.py`)

Provides a user-friendly interface to manage maintenance mode:

- Toggle maintenance on/off
- Set custom maintenance message
- Configure start/end times
- Enable/disable countdown timer
- View maintenance history (timestamps preserved when disabling)

**Access:** Navigate to `/admin/` → "Application Settings" → "Maintenance Mode"

#### 4. API Endpoint

**Endpoint:** `GET /api/maintenance-status/`

**Response (Maintenance Enabled):**
```json
{
  "maintenance_enabled": true,
  "message": "System is under maintenance. We'll be back soon!",
  "show_countdown": true,
  "start_time": "2026-01-01T12:00:00Z",
  "end_time": "2026-01-01T14:00:00Z"
}
```

**Response (Maintenance Disabled):**
```json
{
  "maintenance_enabled": false,
  "message": null,
  "show_countdown": true
}
```

### Frontend (React)

#### 1. MaintenancePage Component (`frontend/src/components/MaintenancePage.jsx`)

A full-page component displayed during maintenance mode featuring:

- Clean, modern UI with gradient background
- Custom maintenance message
- Real-time countdown timer (hours, minutes, seconds)
- Estimated return time
- Responsive design (mobile-friendly)
- Professional branding

#### 2. useMaintenanceCheck Hook (`frontend/src/hooks/useMaintenanceCheck.js`)

A React hook that checks maintenance status:

```javascript
const { 
  isMaintenanceMode, 
  maintenanceData, 
  isLoading,
  refetch 
} = useMaintenanceCheck(30000); // Poll every 30 seconds
```

**Features:**
- Automatic polling at configurable interval
- Handles both 200 and 503 responses
- Error handling
- Manual refetch capability

#### 3. App Integration (`frontend/src/App.jsx`)

The main App component integrates maintenance checking:

- Checks maintenance status on app load
- Polls every 30 seconds for status updates
- Redirects non-admin users to maintenance page
- Allows admin users to bypass maintenance mode

## Usage

### Enabling Maintenance Mode

**Via Django Admin:**

1. Navigate to `/admin/`
2. Log in with admin credentials
3. Click "Application Settings"
4. Click the settings instance (or create if first time)
5. Check "Maintenance enabled"
6. Set a custom message (optional)
7. Set end time (optional, for countdown)
8. Click "Save"

**Via Django Shell:**

```python
from core.models import AppSettings
from django.utils import timezone
from datetime import timedelta

settings = AppSettings.get_settings()
settings.maintenance_enabled = True
settings.maintenance_message = "We're upgrading our systems. Back in 2 hours!"
settings.maintenance_start_time = timezone.now()
settings.maintenance_end_time = timezone.now() + timedelta(hours=2)
settings.show_countdown = True
settings.save()
```

**Via Python Code:**

```python
from core.models import AppSettings

# Enable maintenance
settings = AppSettings.get_settings()
settings.maintenance_enabled = True
settings.save()

# Disable maintenance
settings.maintenance_enabled = False
settings.save()
```

### Disabling Maintenance Mode

Simply uncheck "Maintenance enabled" in the admin panel and save.

The system will automatically resume normal operation. The maintenance start/end times are preserved for historical reference.

## Architecture

### Cache Strategy

The `AppSettings` model uses Django's cache framework to minimize database queries:

- Settings are cached for 60 seconds after first access
- Cache is automatically cleared when settings are saved
- Uses `maintenance_settings` cache key

### Singleton Pattern

Only one `AppSettings` instance can exist in the database:

- Primary key is forced to `1`
- `get_or_create` ensures safe initialization
- Prevents configuration conflicts

### Request Flow

1. Request arrives at Django
2. Middleware checks if path is exempt
3. Middleware checks if user is admin
4. If not exempt/admin, checks `AppSettings.is_maintenance_active()`
5. If active, returns 503 with maintenance data
6. Otherwise, request proceeds normally

### Frontend Flow

1. App mounts and calls `useMaintenanceCheck()`
2. Hook fetches `/api/maintenance-status/`
3. If `maintenance_enabled=true` and user is not admin, show `MaintenancePage`
4. Hook polls every 30 seconds for status changes
5. When maintenance ends, app automatically returns to normal

## Testing

### Backend Tests

Run the comprehensive test suite:

```bash
cd backend
python manage.py test core
```

**Test Coverage:**
- Model singleton pattern
- Cache behavior
- Middleware blocking
- Admin/staff access during maintenance
- API endpoint responses
- Timing data inclusion

### Manual Testing

1. **Enable maintenance via admin**
2. **Test regular user access:** Visit site in incognito window → Should see maintenance page
3. **Test admin access:** Log in as admin → Should access normally
4. **Test API endpoint:** `curl http://localhost:8000/api/maintenance-status/`
5. **Test countdown:** Set end time 2 hours in future → Verify countdown displays
6. **Disable maintenance:** Uncheck in admin → Verify normal access restored

## Security

### CodeQL Analysis

✅ **0 vulnerabilities found**

The feature has been scanned with CodeQL and found no security issues.

### Security Considerations

- ✅ Admin panel always accessible (prevents lockout)
- ✅ Authentication checked before allowing bypass
- ✅ No sensitive data exposed in maintenance messages
- ✅ Cache properly invalidated on updates
- ✅ No timing attack vectors (simple boolean check)
- ✅ Middleware runs after authentication middleware

## Performance

### Optimizations

1. **Caching:** Settings cached for 60 seconds
2. **Single Query:** `is_maintenance_active()` uses cached data
3. **Middleware Position:** Placed last in middleware stack
4. **Database Indexes:** Primary key on singleton model
5. **Frontend Polling:** Configurable interval (default 30s)

### Impact

- **Negligible overhead** when maintenance is disabled
- **One cache check** per request
- **Frontend polls** every 30 seconds (low bandwidth)

## Troubleshooting

### Issue: "I'm locked out during maintenance"

**Solution:** Access via admin panel at `/admin/` - it's always accessible.

### Issue: "Changes not reflecting immediately"

**Solution:** Cache is cleared automatically, but you can manually clear it:

```python
from django.core.cache import cache
cache.clear()
```

### Issue: "Frontend shows old maintenance status"

**Solution:** The frontend polls every 30 seconds. Wait up to 30 seconds or refresh the page.

### Issue: "Countdown timer not showing"

**Checklist:**
1. Is `show_countdown` enabled in settings?
2. Is `maintenance_end_time` set?
3. Is end time in the future?

### Issue: "Tests failing after migration"

**Solution:** Run migrations in test database:

```bash
python manage.py migrate --run-syncdb
```

## Future Enhancements

Potential improvements for future versions:

1. **Scheduled Maintenance:** Auto-enable at specific date/time
2. **Multiple Messages:** Different messages for different user types
3. **Maintenance History:** Log all maintenance periods
4. **Email Notifications:** Alert admins when maintenance is enabled
5. **Custom Themes:** Allow customizing maintenance page appearance
6. **Progressive Web App:** Update service worker to show maintenance offline
7. **WebSocket Updates:** Real-time maintenance status without polling
8. **Partial Maintenance:** Restrict specific features instead of entire site

## API Reference

### Backend

#### `AppSettings` Model

```python
# Get settings instance
settings = AppSettings.get_settings()

# Check if maintenance is active
is_active = AppSettings.is_maintenance_active()

# Update settings
settings.maintenance_enabled = True
settings.maintenance_message = "Custom message"
settings.save()
```

#### Middleware Configuration

```python
# settings.py
MIDDLEWARE = [
    # ... other middleware ...
    "core.middleware.MaintenanceModeMiddleware",  # Must be last
]
```

### Frontend

#### `useMaintenanceCheck` Hook

```javascript
import useMaintenanceCheck from './hooks/useMaintenanceCheck';

function MyComponent() {
  const { 
    isMaintenanceMode,    // boolean
    maintenanceData,      // object with message, times, etc.
    isLoading,            // boolean
    error,                // error message or null
    refetch              // function to manually refetch
  } = useMaintenanceCheck(30000); // Poll interval in ms
  
  // Your component logic
}
```

#### `MaintenancePage` Component

```javascript
import MaintenancePage from './components/MaintenancePage';

<MaintenancePage maintenanceData={{
  message: "We're under maintenance",
  show_countdown: true,
  end_time: "2026-01-01T14:00:00Z"
}} />
```

## License

This feature is part of the MafitaPay project and follows the same license.
