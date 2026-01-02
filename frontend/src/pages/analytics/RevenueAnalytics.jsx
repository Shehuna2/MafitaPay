import AnalyticsLineChart from '../../components/analytics/AnalyticsLineChart';
import AnalyticsPieChart from '../../components/analytics/AnalyticsPieChart';
import AnalyticsBarChart from '../../components/analytics/AnalyticsBarChart';
import DataTable from '../../components/analytics/DataTable';
import DateRangePicker from '../../components/analytics/DateRangePicker';
import ExportButton from '../../components/analytics/ExportButton';
import { useRevenueAnalytics } from '../../hooks/useAnalytics';
import { useFilters } from '../../hooks/useFilters';
import { formatCurrency, formatNumber } from '../../services/formatters';
import { PageSkeleton } from '../../components/analytics/LoadingSkeletons';

/**
 * RevenueAnalytics - Financial metrics and revenue analytics
 */
const RevenueAnalytics = () => {
  const { filters, updateFilters, setDateRange } = useFilters();
  
  const { data, isLoading, error, refetch } = useRevenueAnalytics({
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-500 text-lg mb-4">Failed to load revenue analytics</p>
          <button 
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <PageSkeleton />;
  }

  const analytics = data || {};
  const revenueTrend = analytics.revenue_trend || [];
  const paymentMethodBreakdown = analytics.payment_method_breakdown || [];
  const serviceBreakdown = analytics.service_breakdown || [];
  const topPaymentMethods = analytics.top_payment_methods || [];

  const tableColumns = [
    {
      header: 'Payment Method',
      key: 'method',
    },
    {
      header: 'Revenue',
      key: 'revenue',
      render: (row) => formatCurrency(row.revenue),
    },
    {
      header: 'Transactions',
      key: 'count',
      render: (row) => formatNumber(row.count),
    },
    {
      header: 'Avg. Transaction',
      key: 'average',
      render: (row) => formatCurrency(row.average),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white">Revenue</h2>
          <p className="text-gray-400 mt-1">Financial metrics and revenue breakdown</p>
        </div>
        <DateRangePicker
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          onChange={updateFilters}
          onQuickSelect={setDateRange}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <h4 className="text-gray-400 text-sm mb-2">Total Revenue</h4>
          <p className="text-2xl font-bold text-white">
            {formatCurrency(analytics.total_revenue || 0)}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h4 className="text-gray-400 text-sm mb-2">Net Profit</h4>
          <p className="text-2xl font-bold text-white">
            {formatCurrency(analytics.net_profit || 0)}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h4 className="text-gray-400 text-sm mb-2">Expenses</h4>
          <p className="text-2xl font-bold text-white">
            {formatCurrency(analytics.total_expenses || 0)}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h4 className="text-gray-400 text-sm mb-2">Profit Margin</h4>
          <p className="text-2xl font-bold text-white">
            {((analytics.net_profit / analytics.total_revenue) * 100 || 0).toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Revenue Trend */}
      <div>
        <h3 className="text-xl font-bold text-white mb-4">Revenue Trend</h3>
        <AnalyticsLineChart
          data={revenueTrend}
          lines={[
            { dataKey: 'revenue', name: 'Revenue', color: '#10b981' },
            { dataKey: 'profit', name: 'Profit', color: '#3b82f6' },
          ]}
          xKey="date"
          height={350}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Revenue by Payment Method</h3>
          <AnalyticsBarChart
            data={paymentMethodBreakdown}
            bars={[
              { dataKey: 'revenue', name: 'Revenue', color: '#3b82f6' }
            ]}
            xKey="method"
            layout="horizontal"
          />
        </div>

        <div>
          <h3 className="text-xl font-bold text-white mb-4">Revenue by Service</h3>
          <AnalyticsPieChart
            data={serviceBreakdown}
            dataKey="revenue"
            nameKey="service"
          />
        </div>
      </div>

      {/* Top Payment Methods Table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Top Payment Methods</h3>
          <ExportButton 
            data={topPaymentMethods} 
            filename={`revenue_payment_methods_${filters.dateFrom}_to_${filters.dateTo}.csv`}
          />
        </div>
        <DataTable
          columns={tableColumns}
          data={topPaymentMethods}
          pageSize={10}
        />
      </div>
    </div>
  );
};

export default RevenueAnalytics;
