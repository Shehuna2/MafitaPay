import { useState } from 'react';
import AnalyticsLineChart from '../../components/analytics/AnalyticsLineChart';
import AnalyticsPieChart from '../../components/analytics/AnalyticsPieChart';
import DataTable from '../../components/analytics/DataTable';
import DateRangePicker from '../../components/analytics/DateRangePicker';
import ExportButton from '../../components/analytics/ExportButton';
import { useTransactionAnalytics } from '../../hooks/useAnalytics';
import { useFilters } from '../../hooks/useFilters';
import { formatCurrency, formatDate, formatNumber } from '../../services/formatters';
import { PageSkeleton } from '../../components/analytics/LoadingSkeletons';

/**
 * TransactionsAnalytics - Detailed transaction analytics page
 */
const TransactionsAnalytics = () => {
  const { filters, updateFilters, setDateRange } = useFilters();
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const { data, isLoading, error, refetch } = useTransactionAnalytics({
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-500 text-lg mb-4">Failed to load transaction analytics</p>
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
  const volumeData = analytics.volume_over_time || [];
  const typeBreakdown = analytics.type_breakdown || [];
  const statusBreakdown = analytics.status_breakdown || [];
  const transactions = analytics.transactions || [];

  const tableColumns = [
    {
      header: 'Date',
      key: 'created_at',
      render: (row) => formatDate(row.created_at, 'MMM dd, yyyy HH:mm'),
    },
    {
      header: 'Type',
      key: 'transaction_type',
    },
    {
      header: 'Amount',
      key: 'amount',
      render: (row) => formatCurrency(row.amount),
    },
    {
      header: 'Status',
      key: 'status',
      render: (row) => (
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          row.status === 'completed' ? 'bg-green-600 text-white' :
          row.status === 'pending' ? 'bg-yellow-600 text-white' :
          'bg-red-600 text-white'
        }`}>
          {row.status}
        </span>
      ),
    },
    {
      header: 'User',
      key: 'username',
    },
  ];

  return (
    <div className="section-gap">
      {/* Page Header */}
      <div className="section-header">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">Transactions</h2>
          <p className="text-gray-400 mt-1">Detailed transaction analytics</p>
        </div>
        <DateRangePicker
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          onChange={updateFilters}
          onQuickSelect={setDateRange}
        />
      </div>

      {/* Summary Cards */}
      <div className="panel-grid">
        <div className="glass-card p-6">
          <h4 className="text-gray-400 text-sm mb-2 tracking-wide">Total Volume</h4>
          <p className="text-xl md:text-2xl font-bold text-white">
            {formatCurrency(analytics.total_volume || 0)}
          </p>
        </div>
        <div className="glass-card p-6">
          <h4 className="text-gray-400 text-sm mb-2 tracking-wide">Transaction Count</h4>
          <p className="text-xl md:text-2xl font-bold text-white">
            {formatNumber(analytics.total_count || 0)}
          </p>
        </div>
        <div className="glass-card p-6">
          <h4 className="text-gray-400 text-sm mb-2 tracking-wide">Average Transaction</h4>
          <p className="text-xl md:text-2xl font-bold text-white">
            {formatCurrency(analytics.average_transaction || 0)}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="chart-grid">
        <div className="glass-panel p-6">
          <h3 className="text-xl font-bold text-white mb-4">Volume Over Time</h3>
          <AnalyticsLineChart
            data={volumeData}
            lines={[
              { dataKey: 'volume', name: 'Transaction Volume', color: '#3b82f6' }
            ]}
            xKey="date"
          />
        </div>

        <div className="glass-panel p-6">
          <h3 className="text-xl font-bold text-white mb-4">Transaction Types</h3>
          <AnalyticsPieChart
            data={typeBreakdown}
            dataKey="count"
            nameKey="type"
          />
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="glass-panel p-6">
        <h3 className="text-xl font-bold text-white mb-4">Status Breakdown</h3>
        <AnalyticsPieChart
          data={statusBreakdown}
          dataKey="count"
          nameKey="status"
          innerRadius={60}
        />
      </div>

      {/* Filters */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-bold text-white mb-4">Filters</h3>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-white/5 text-white rounded-lg border 
                border-white/10 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-4 py-2 bg-white/5 text-white rounded-lg border 
                border-white/10 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Types</option>
              <option value="p2p">P2P</option>
              <option value="bills">Bills</option>
              <option value="crypto">Crypto</option>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transaction Table */}
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Transaction History</h3>
          <ExportButton 
            data={transactions} 
            filename={`transactions_${filters.dateFrom}_to_${filters.dateTo}.csv`}
          />
        </div>
        <DataTable
          columns={tableColumns}
          data={transactions}
          pageSize={10}
        />
      </div>
    </div>
  );
};

export default TransactionsAnalytics;
