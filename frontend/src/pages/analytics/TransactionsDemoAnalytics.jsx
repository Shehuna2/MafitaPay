import { useState } from 'react';
import AnalyticsLineChart from '../../components/analytics/AnalyticsLineChart';
import AnalyticsPieChart from '../../components/analytics/AnalyticsPieChart';
import DataTable from '../../components/analytics/DataTable';
import DateRangePicker from '../../components/analytics/DateRangePicker';
import ExportButton from '../../components/analytics/ExportButton';
import { useFilters } from '../../hooks/useFilters';
import { formatCurrency, formatDate, formatNumber } from '../../services/formatters';

/**
 * TransactionsDemoAnalytics - Demo transactions page with mock data
 */
const TransactionsDemoAnalytics = () => {
  const { filters, updateFilters, setDateRange } = useFilters();
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Mock data
  const analytics = {
    total_volume: 45678900,
    total_count: 12543,
    average_transaction: 3642,
  };

  const volumeData = [
    { date: 'Jan 1', volume: 1200000 },
    { date: 'Jan 8', volume: 1450000 },
    { date: 'Jan 15', volume: 1680000 },
    { date: 'Jan 22', volume: 1820000 },
    { date: 'Jan 29', volume: 2100000 },
  ];

  const typeBreakdown = [
    { type: 'P2P Trading', count: 5420 },
    { type: 'Bill Payments', count: 3890 },
    { type: 'Crypto', count: 2340 },
    { type: 'Deposits', count: 893 },
  ];

  const statusBreakdown = [
    { status: 'Completed', count: 11853 },
    { status: 'Pending', count: 542 },
    { status: 'Failed', count: 148 },
  ];

  const transactions = [
    { created_at: '2025-01-02T10:30:00Z', transaction_type: 'P2P', amount: 50000, status: 'completed', username: 'user123' },
    { created_at: '2025-01-02T10:25:00Z', transaction_type: 'Bills', amount: 2500, status: 'completed', username: 'user456' },
    { created_at: '2025-01-02T10:20:00Z', transaction_type: 'Crypto', amount: 100000, status: 'pending', username: 'user789' },
    { created_at: '2025-01-02T10:15:00Z', transaction_type: 'P2P', amount: 75000, status: 'completed', username: 'user321' },
    { created_at: '2025-01-02T10:10:00Z', transaction_type: 'Deposit', amount: 20000, status: 'failed', username: 'user654' },
    { created_at: '2025-01-02T10:05:00Z', transaction_type: 'Bills', amount: 5000, status: 'completed', username: 'user987' },
    { created_at: '2025-01-02T10:00:00Z', transaction_type: 'P2P', amount: 150000, status: 'completed', username: 'user147' },
  ];

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
            {formatCurrency(analytics.total_volume)}
          </p>
        </div>
        <div className="glass-card p-6">
          <h4 className="text-gray-400 text-sm mb-2 tracking-wide">Transaction Count</h4>
          <p className="text-xl md:text-2xl font-bold text-white">
            {formatNumber(analytics.total_count)}
          </p>
        </div>
        <div className="glass-card p-6">
          <h4 className="text-gray-400 text-sm mb-2 tracking-wide">Average Transaction</h4>
          <p className="text-xl md:text-2xl font-bold text-white">
            {formatCurrency(analytics.average_transaction)}
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

export default TransactionsDemoAnalytics;
