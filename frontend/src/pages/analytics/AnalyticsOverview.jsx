import { FiDollarSign, FiTrendingUp, FiUsers, FiActivity } from 'react-icons/fi';
import MetricCard from '../../components/analytics/MetricCard';
import DateRangePicker from '../../components/analytics/DateRangePicker';
import { useOverviewAnalytics } from '../../hooks/useAnalytics';
import { useFilters } from '../../hooks/useFilters';
import { formatCurrency, formatNumber, formatPercentage } from '../../services/formatters';
import { PageSkeleton } from '../../components/analytics/LoadingSkeletons';

/**
 * AnalyticsOverview - Overview page with key metrics
 */
const AnalyticsOverview = () => {
  const { filters, updateFilters, setDateRange } = useFilters();
  const { data, isLoading, error, refetch } = useOverviewAnalytics({
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-500 text-lg mb-4">Failed to load analytics data</p>
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

  const metrics = data || {};

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white">Overview</h2>
          <p className="text-gray-400 mt-1">Quick glance at key metrics</p>
        </div>
        <DateRangePicker
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          onChange={updateFilters}
          onQuickSelect={setDateRange}
        />
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Transactions"
          value={formatNumber(metrics.total_transactions || 0)}
          icon={FiActivity}
          trend={metrics.transactions_trend}
          color="blue"
        />
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(metrics.total_revenue || 0)}
          icon={FiDollarSign}
          trend={metrics.revenue_trend}
          color="green"
        />
        <MetricCard
          title="Active Users"
          value={formatNumber(metrics.active_users || 0)}
          icon={FiUsers}
          trend={metrics.users_trend}
          color="cyan"
        />
        <MetricCard
          title="P2P Trading Volume"
          value={formatCurrency(metrics.p2p_volume || 0)}
          icon={FiTrendingUp}
          trend={metrics.p2p_trend}
          color="orange"
        />
      </div>

      {/* Success Rate */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-850 rounded-xl p-6 border border-gray-700/50 shadow-xl">
        <h3 className="text-xl font-bold text-white mb-4">Transaction Success Rate</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-gray-700/50 rounded-full h-4 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-green-500 to-green-600 h-full transition-all duration-500 shadow-lg"
              style={{ width: `${metrics.success_rate || 0}%` }}
            />
          </div>
          <span className="text-2xl font-bold text-white">
            {formatPercentage(metrics.success_rate || 0)}
          </span>
        </div>
        <p className="text-gray-400 text-sm mt-2">
          {formatNumber(metrics.successful_transactions || 0)} successful out of{' '}
          {formatNumber(metrics.total_transactions || 0)} total transactions
        </p>
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-gray-800 to-gray-850 rounded-xl p-6 border border-gray-700/50 shadow-xl hover:shadow-2xl transition-all duration-300">
          <h4 className="text-gray-400 text-sm mb-2 tracking-wide">Bill Payments</h4>
          <p className="text-2xl font-bold text-white">
            {formatCurrency(metrics.bill_payments_volume || 0)}
          </p>
        </div>
        <div className="bg-gradient-to-br from-gray-800 to-gray-850 rounded-xl p-6 border border-gray-700/50 shadow-xl hover:shadow-2xl transition-all duration-300">
          <h4 className="text-gray-400 text-sm mb-2 tracking-wide">Crypto Purchases</h4>
          <p className="text-2xl font-bold text-white">
            {formatCurrency(metrics.crypto_volume || 0)}
          </p>
        </div>
        <div className="bg-gradient-to-br from-gray-800 to-gray-850 rounded-xl p-6 border border-gray-700/50 shadow-xl hover:shadow-2xl transition-all duration-300">
          <h4 className="text-gray-400 text-sm mb-2 tracking-wide">Rewards Distributed</h4>
          <p className="text-2xl font-bold text-white">
            {formatCurrency(metrics.rewards_distributed || 0)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsOverview;
