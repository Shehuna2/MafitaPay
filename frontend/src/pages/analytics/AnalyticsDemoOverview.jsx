import { useState } from 'react';
import { FiDollarSign, FiTrendingUp, FiUsers, FiActivity } from 'react-icons/fi';
import MetricCard from '../../components/analytics/MetricCard';
import AnalyticsLineChart from '../../components/analytics/AnalyticsLineChart';
import AnalyticsPieChart from '../../components/analytics/AnalyticsPieChart';
import DateRangePicker from '../../components/analytics/DateRangePicker';
import { useFilters } from '../../hooks/useFilters';
import { formatCurrency, formatNumber, formatPercentage } from '../../services/formatters';

/**
 * AnalyticsDemoOverview - Demo page with mock data for showcase
 */
const AnalyticsDemoOverview = () => {
  const { filters, updateFilters, setDateRange } = useFilters();

  // Mock data
  const metrics = {
    total_transactions: 12543,
    transactions_trend: 12.5,
    total_revenue: 45678900,
    revenue_trend: 8.3,
    active_users: 3456,
    users_trend: 15.2,
    p2p_volume: 23456789,
    p2p_trend: -3.4,
    success_rate: 94.5,
    successful_transactions: 11853,
    bill_payments_volume: 8900000,
    crypto_volume: 15600000,
    rewards_distributed: 2340000,
  };

  return (
    <div className="section-gap">
      {/* Page Header */}
      <div className="section-header">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">Overview</h2>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <MetricCard
          title="Total Transactions"
          value={formatNumber(metrics.total_transactions)}
          icon={FiActivity}
          trend={metrics.transactions_trend}
          color="blue"
        />
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(metrics.total_revenue)}
          icon={FiDollarSign}
          trend={metrics.revenue_trend}
          color="green"
        />
        <MetricCard
          title="Active Users"
          value={formatNumber(metrics.active_users)}
          icon={FiUsers}
          trend={metrics.users_trend}
          color="cyan"
        />
        <MetricCard
          title="P2P Trading Volume"
          value={formatCurrency(metrics.p2p_volume)}
          icon={FiTrendingUp}
          trend={metrics.p2p_trend}
          color="orange"
        />
      </div>

      {/* Success Rate */}
      <div className="glass-panel p-6">
        <h3 className="text-xl font-bold text-white mb-4">Transaction Success Rate</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-white/5 rounded-full h-4 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-green-500 to-green-600 h-full transition-all duration-500 shadow-lg"
              style={{ width: `${metrics.success_rate}%` }}
            />
          </div>
          <span className="text-xl md:text-2xl font-bold text-white">
            {formatPercentage(metrics.success_rate)}
          </span>
        </div>
        <p className="text-gray-400 text-sm mt-2">
          {formatNumber(metrics.successful_transactions)} successful out of{' '}
          {formatNumber(metrics.total_transactions)} total transactions
        </p>
      </div>

      {/* Charts */}
      <div className="chart-grid">
        <div className="glass-panel p-6">
          <h3 className="text-xl font-bold text-white mb-4">Revenue Trend</h3>
          <AnalyticsLineChart
            data={[
              { date: 'Jan 1', revenue: 1200000 },
              { date: 'Jan 8', revenue: 1450000 },
              { date: 'Jan 15', revenue: 1680000 },
              { date: 'Jan 22', revenue: 1820000 },
              { date: 'Jan 29', revenue: 2100000 },
            ]}
            lines={[
              { dataKey: 'revenue', name: 'Revenue', color: '#10b981' }
            ]}
            xKey="date"
          />
        </div>

        <div className="glass-panel p-6">
          <h3 className="text-xl font-bold text-white mb-4">Service Distribution</h3>
          <AnalyticsPieChart
            data={[
              { name: 'P2P Trading', value: 45 },
              { name: 'Bill Payments', value: 30 },
              { name: 'Crypto', value: 20 },
              { name: 'Rewards', value: 5 },
            ]}
            dataKey="value"
            nameKey="name"
          />
        </div>
      </div>

      {/* Additional Metrics */}
      <div className="panel-grid">
        <div className="glass-card p-6">
          <h4 className="text-gray-400 text-sm mb-2 tracking-wide">Bill Payments</h4>
          <p className="text-xl md:text-2xl font-bold text-white">
            {formatCurrency(metrics.bill_payments_volume)}
          </p>
        </div>
        <div className="glass-card p-6">
          <h4 className="text-gray-400 text-sm mb-2 tracking-wide">Crypto Purchases</h4>
          <p className="text-xl md:text-2xl font-bold text-white">
            {formatCurrency(metrics.crypto_volume)}
          </p>
        </div>
        <div className="glass-card p-6">
          <h4 className="text-gray-400 text-sm mb-2 tracking-wide">Rewards Distributed</h4>
          <p className="text-xl md:text-2xl font-bold text-white">
            {formatCurrency(metrics.rewards_distributed)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDemoOverview;
