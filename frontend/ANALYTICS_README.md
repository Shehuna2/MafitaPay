# CEO Analytics Dashboard

A comprehensive analytics dashboard for executives to monitor key business metrics, track performance, and generate reports.

## Features

### Pages

1. **Overview** - Quick glance at key metrics
   - Total transactions, revenue, active users, P2P volume
   - Transaction success rate
   - Bill payments, crypto, and rewards metrics

2. **Transactions** - Detailed transaction analytics
   - Transaction volume over time
   - Transaction type breakdown (pie chart)
   - Transaction status breakdown
   - Filterable transaction table
   - CSV export

3. **Revenue** - Financial metrics
   - Revenue trend chart
   - Revenue by payment method (bar chart)
   - Revenue by service (pie chart)
   - Top payment methods table
   - Profit margin and expenses

4. **Users** - User analytics
   - User growth chart
   - New users, active users metrics
   - User segmentation (merchants vs. regular users)
   - Top referrers table
   - Retention metrics

5. **Services** - Service performance
   - P2P trading volume (deposits vs. withdrawals)
   - Bill payment breakdown by category
   - Crypto purchase metrics
   - Service usage distribution
   - Top services table

6. **KPIs** - Key performance indicators
   - DAU (Daily Active Users)
   - MAU (Monthly Active Users)
   - CAC (Customer Acquisition Cost)
   - LTV (Lifetime Value)
   - Churn rate
   - Transaction success rate
   - Growth metrics

7. **Reports** - Report generation
   - Report type selector (daily, weekly, monthly, custom)
   - Date range picker
   - Metrics selection
   - Export to CSV/JSON
   - Report history

## Technology Stack

- **React** - UI library
- **React Router** - Navigation
- **React Query (@tanstack/react-query)** - Data fetching and caching
- **Recharts** - Charts and visualizations
- **Tailwind CSS** - Styling
- **Axios** - HTTP client
- **date-fns** - Date formatting
- **React Icons** - Icons

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- Backend API running with analytics endpoints

### Installation

The dependencies are already installed in the main project. If you need to install them separately:

```bash
npm install @tanstack/react-query date-fns
```

### Environment Variables

Add the following to your `.env` file:

```env
VITE_API_URL=http://localhost:8000/api
```

### Running the Dashboard

The analytics dashboard is integrated into the main application. Navigate to:

```
/analytics/overview
```

You must be logged in as an admin/staff user to access the analytics dashboard.

## API Endpoints

The dashboard expects the following backend endpoints:

- `GET /api/analytics/dashboard/overview/` - Overview metrics
- `GET /api/analytics/transactions/` - Transaction analytics
- `GET /api/analytics/revenue/` - Revenue analytics
- `GET /api/analytics/users/` - User analytics
- `GET /api/analytics/services/` - Service analytics
- `GET /api/analytics/kpis/` - KPI metrics
- `GET /api/analytics/reports/export/` - Export reports

### Query Parameters

All endpoints support the following query parameters:

- `date_from` - Start date (YYYY-MM-DD)
- `date_to` - End date (YYYY-MM-DD)
- Additional filters depending on the endpoint (e.g., `status`, `type`, `payment_method`)

## Project Structure

```
src/
├── pages/analytics/
│   ├── AnalyticsOverview.jsx
│   ├── TransactionsAnalytics.jsx
│   ├── RevenueAnalytics.jsx
│   ├── UsersAnalytics.jsx
│   ├── ServicesAnalytics.jsx
│   ├── KPIsAnalytics.jsx
│   └── ReportsAnalytics.jsx
├── components/analytics/
│   ├── AnalyticsSidebar.jsx
│   ├── AnalyticsHeader.jsx
│   ├── MetricCard.jsx
│   ├── AnalyticsLineChart.jsx
│   ├── AnalyticsPieChart.jsx
│   ├── AnalyticsBarChart.jsx
│   ├── DataTable.jsx
│   ├── DateRangePicker.jsx
│   ├── ExportButton.jsx
│   └── LoadingSkeletons.jsx
├── layouts/
│   └── AnalyticsLayout.jsx
├── services/
│   ├── analyticsService.js
│   └── formatters.js
├── hooks/
│   ├── useAnalytics.js
│   └── useFilters.js
└── App.jsx (routes added)
```

## Usage

### Accessing the Dashboard

1. Log in as an admin/staff user
2. Navigate to `/analytics/overview` or click the Analytics link in the navigation
3. Use the sidebar to navigate between different analytics pages

### Using Filters

- **Date Range**: Use the quick range buttons (Today, Last 7 days, etc.) or select a custom date range
- **Status/Type Filters**: Available on the Transactions page
- **Auto-refresh**: Data is cached for 30 seconds and automatically refreshed

### Exporting Data

- Click the "Export CSV" button on pages with tables
- Use the Reports page to generate comprehensive reports with multiple metrics

### Performance

- Data is cached using React Query for better performance
- Automatic refetching on window focus is disabled
- Stale time is set to 30 seconds
- Failed requests are retried once

## Customization

### Adding New Metrics

1. Update the API service in `services/analyticsService.js`
2. Create or update the analytics hook in `hooks/useAnalytics.js`
3. Add the metric to the relevant page component

### Changing Chart Colors

Edit the color arrays in the chart components:
- `AnalyticsLineChart.jsx`
- `AnalyticsPieChart.jsx`
- `AnalyticsBarChart.jsx`

### Modifying Date Ranges

Update the quick range options in `components/analytics/DateRangePicker.jsx`

## Troubleshooting

### "Failed to load analytics data" Error

- Check that the backend API is running
- Verify the API endpoint URLs in `services/analyticsService.js`
- Check browser console for detailed error messages
- Ensure your user has admin/staff permissions

### Charts Not Displaying

- Check that data is being returned from the API
- Verify the data structure matches what the chart expects
- Check browser console for errors

### Export Not Working

- Ensure the browser allows downloads
- Check that data is available to export
- Verify the `exportToCSV` function in `services/formatters.js`

## Contributing

When adding new features:

1. Follow the existing code structure
2. Use the shared components where possible
3. Add loading and error states
4. Update this README with new features
5. Test with different screen sizes (mobile, tablet, desktop)

## License

Part of the MafitaPay project.
