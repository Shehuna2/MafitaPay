import AnalyticsLineChart from '../../components/analytics/AnalyticsLineChart';
import AnalyticsPieChart from '../../components/analytics/AnalyticsPieChart';
import DataTable from '../../components/analytics/DataTable';
import DateRangePicker from '../../components/analytics/DateRangePicker';
import ExportButton from '../../components/analytics/ExportButton';
import { useUserAnalytics } from '../../hooks/useAnalytics';
import { useFilters } from '../../hooks/useFilters';
import { formatNumber, formatDate } from '../../services/formatters';
import { PageSkeleton } from '../../components/analytics/LoadingSkeletons';

/**
 * UsersAnalytics - User analytics and growth metrics
 */
const UsersAnalytics = () => {
  const { filters, updateFilters, setDateRange } = useFilters();
  
  const { data, isLoading, error, refetch } = useUserAnalytics({
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-500 text-lg mb-4">Failed to load user analytics</p>
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
  const userGrowth = analytics.user_growth || [];
  const userSegmentation = analytics.user_segmentation || [];
  const topReferrers = analytics.top_referrers || [];

  const tableColumns = [
    {
      header: 'User',
      key: 'username',
    },
    {
      header: 'Referrals',
      key: 'referral_count',
      render: (row) => formatNumber(row.referral_count),
    },
    {
      header: 'Active Referrals',
      key: 'active_referrals',
      render: (row) => formatNumber(row.active_referrals),
    },
    {
      header: 'Total Revenue',
      key: 'total_revenue',
      render: (row) => `₦${formatNumber(row.total_revenue)}`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white">Users</h2>
          <p className="text-gray-400 mt-1">User analytics and growth metrics</p>
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
          <h4 className="text-gray-400 text-sm mb-2">Total Users</h4>
          <p className="text-2xl font-bold text-white">
            {formatNumber(analytics.total_users || 0)}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h4 className="text-gray-400 text-sm mb-2">New Users</h4>
          <p className="text-2xl font-bold text-white">
            {formatNumber(analytics.new_users || 0)}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h4 className="text-gray-400 text-sm mb-2">Active Users</h4>
          <p className="text-2xl font-bold text-white">
            {formatNumber(analytics.active_users || 0)}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h4 className="text-gray-400 text-sm mb-2">Retention Rate</h4>
          <p className="text-2xl font-bold text-white">
            {(analytics.retention_rate || 0).toFixed(2)}%
          </p>
        </div>
      </div>

      {/* User Growth Chart */}
      <div>
        <h3 className="text-xl font-bold text-white mb-4">User Growth</h3>
        <AnalyticsLineChart
          data={userGrowth}
          lines={[
            { dataKey: 'total_users', name: 'Total Users', color: '#3b82f6' },
            { dataKey: 'new_users', name: 'New Users', color: '#10b981' },
            { dataKey: 'active_users', name: 'Active Users', color: '#f59e0b' },
          ]}
          xKey="date"
          height={350}
        />
      </div>

      {/* User Segmentation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-xl font-bold text-white mb-4">User Segmentation</h3>
          <AnalyticsPieChart
            data={userSegmentation}
            dataKey="count"
            nameKey="segment"
          />
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-bold text-white mb-4">User Metrics</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-gray-700">
              <span className="text-gray-400">Merchants</span>
              <span className="text-white font-bold text-lg">
                {formatNumber(analytics.merchant_count || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-gray-700">
              <span className="text-gray-400">Regular Users</span>
              <span className="text-white font-bold text-lg">
                {formatNumber(analytics.regular_user_count || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-gray-700">
              <span className="text-gray-400">Verified Users</span>
              <span className="text-white font-bold text-lg">
                {formatNumber(analytics.verified_users || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-gray-400">Avg. Users per Day</span>
              <span className="text-white font-bold text-lg">
                {formatNumber(analytics.avg_daily_users || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Referrers Table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Top Referrers</h3>
          <ExportButton 
            data={topReferrers} 
            filename={`top_referrers_${filters.dateFrom}_to_${filters.dateTo}.csv`}
          />
        </div>
        <DataTable
          columns={tableColumns}
          data={topReferrers}
          pageSize={10}
        />
      </div>
    </div>
  );
};

export default UsersAnalytics;
