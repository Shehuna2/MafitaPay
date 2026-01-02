import AnalyticsLineChart from '../../components/analytics/AnalyticsLineChart';
import AnalyticsPieChart from '../../components/analytics/AnalyticsPieChart';
import AnalyticsBarChart from '../../components/analytics/AnalyticsBarChart';
import DataTable from '../../components/analytics/DataTable';
import DateRangePicker from '../../components/analytics/DateRangePicker';
import { useServiceAnalytics } from '../../hooks/useAnalytics';
import { useFilters } from '../../hooks/useFilters';
import { formatCurrency, formatNumber } from '../../services/formatters';
import { PageSkeleton } from '../../components/analytics/LoadingSkeletons';

/**
 * ServicesAnalytics - Service performance analytics
 */
const ServicesAnalytics = () => {
  const { filters, updateFilters, setDateRange } = useFilters();
  
  const { data, isLoading, error, refetch } = useServiceAnalytics({
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-500 text-lg mb-4">Failed to load service analytics</p>
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
  const p2pData = analytics.p2p_data || [];
  const billPaymentBreakdown = analytics.bill_payment_breakdown || [];
  const serviceUsage = analytics.service_usage || [];
  const topServices = analytics.top_services || [];

  const tableColumns = [
    {
      header: 'Service',
      key: 'service_name',
    },
    {
      header: 'Usage Count',
      key: 'usage_count',
      render: (row) => formatNumber(row.usage_count),
    },
    {
      header: 'Revenue',
      key: 'revenue',
      render: (row) => formatCurrency(row.revenue),
    },
    {
      header: 'Success Rate',
      key: 'success_rate',
      render: (row) => `${row.success_rate?.toFixed(2) || 0}%`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white">Services</h2>
          <p className="text-gray-400 mt-1">Service performance and usage metrics</p>
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
          <h4 className="text-gray-400 text-sm mb-2">P2P Trading</h4>
          <p className="text-2xl font-bold text-white">
            {formatCurrency(analytics.p2p_volume || 0)}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h4 className="text-gray-400 text-sm mb-2">Bill Payments</h4>
          <p className="text-2xl font-bold text-white">
            {formatCurrency(analytics.bill_payment_volume || 0)}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h4 className="text-gray-400 text-sm mb-2">Crypto Purchases</h4>
          <p className="text-2xl font-bold text-white">
            {formatCurrency(analytics.crypto_volume || 0)}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h4 className="text-gray-400 text-sm mb-2">Total Transactions</h4>
          <p className="text-2xl font-bold text-white">
            {formatNumber(analytics.total_service_transactions || 0)}
          </p>
        </div>
      </div>

      {/* P2P Trading */}
      <div>
        <h3 className="text-xl font-bold text-white mb-4">P2P Trading Volume</h3>
        <AnalyticsLineChart
          data={p2pData}
          lines={[
            { dataKey: 'deposits', name: 'Deposits', color: '#10b981' },
            { dataKey: 'withdrawals', name: 'Withdrawals', color: '#ef4444' },
          ]}
          xKey="date"
          height={300}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Bill Payment Breakdown</h3>
          <AnalyticsBarChart
            data={billPaymentBreakdown}
            bars={[
              { dataKey: 'volume', name: 'Volume', color: '#3b82f6' }
            ]}
            xKey="category"
            layout="horizontal"
          />
        </div>

        <div>
          <h3 className="text-xl font-bold text-white mb-4">Service Usage Distribution</h3>
          <AnalyticsPieChart
            data={serviceUsage}
            dataKey="count"
            nameKey="service"
          />
        </div>
      </div>

      {/* Bill Payment Categories */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-bold text-white mb-4">Bill Payment Categories</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="text-center p-4 bg-gray-700 rounded-lg">
            <p className="text-gray-400 text-sm mb-2">Airtime</p>
            <p className="text-xl font-bold text-white">
              {formatCurrency(analytics.airtime_volume || 0)}
            </p>
          </div>
          <div className="text-center p-4 bg-gray-700 rounded-lg">
            <p className="text-gray-400 text-sm mb-2">Data</p>
            <p className="text-xl font-bold text-white">
              {formatCurrency(analytics.data_volume || 0)}
            </p>
          </div>
          <div className="text-center p-4 bg-gray-700 rounded-lg">
            <p className="text-gray-400 text-sm mb-2">Cable TV</p>
            <p className="text-xl font-bold text-white">
              {formatCurrency(analytics.cable_volume || 0)}
            </p>
          </div>
          <div className="text-center p-4 bg-gray-700 rounded-lg">
            <p className="text-gray-400 text-sm mb-2">Electricity</p>
            <p className="text-xl font-bold text-white">
              {formatCurrency(analytics.electricity_volume || 0)}
            </p>
          </div>
          <div className="text-center p-4 bg-gray-700 rounded-lg">
            <p className="text-gray-400 text-sm mb-2">Education</p>
            <p className="text-xl font-bold text-white">
              {formatCurrency(analytics.education_volume || 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Top Services Table */}
      <div>
        <h3 className="text-xl font-bold text-white mb-4">Top Services</h3>
        <DataTable
          columns={tableColumns}
          data={topServices}
          pageSize={10}
        />
      </div>
    </div>
  );
};

export default ServicesAnalytics;
