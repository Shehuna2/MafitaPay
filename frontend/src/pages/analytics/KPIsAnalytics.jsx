import { FiTrendingUp, FiTrendingDown } from 'react-icons/fi';
import MetricCard from '../../components/analytics/MetricCard';
import DateRangePicker from '../../components/analytics/DateRangePicker';
import { useKPIAnalytics } from '../../hooks/useAnalytics';
import { useFilters } from '../../hooks/useFilters';
import { formatCurrency, formatNumber, formatPercentage } from '../../services/formatters';
import { PageSkeleton } from '../../components/analytics/LoadingSkeletons';

/**
 * KPIsAnalytics - Key performance indicators
 */
const KPIsAnalytics = () => {
  const { filters, updateFilters, setDateRange } = useFilters();
  
  const { data, isLoading, error, refetch } = useKPIAnalytics({
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-500 text-lg mb-4">Failed to load KPI analytics</p>
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

  const kpis = data || {};

  const KPICard = ({ title, value, trend, trendValue, target, subtitle }) => {
    const progress = target ? (value / target) * 100 : 0;
    const isPositive = trend > 0;

    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h4 className="text-gray-400 text-sm mb-2">{title}</h4>
        <p className="text-3xl font-bold text-white mb-2">{value}</p>
        
        {subtitle && (
          <p className="text-gray-500 text-xs mb-2">{subtitle}</p>
        )}
        
        {trend !== undefined && (
          <div className="flex items-center mb-2">
            {isPositive ? (
              <FiTrendingUp className="text-green-500 mr-1" />
            ) : (
              <FiTrendingDown className="text-red-500 mr-1" />
            )}
            <span className={`text-sm ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
              {trendValue || `${Math.abs(trend).toFixed(2)}%`}
            </span>
            <span className="text-gray-500 text-xs ml-2">vs last period</span>
          </div>
        )}

        {target && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Progress to target</span>
              <span>{progress.toFixed(0)}%</span>
            </div>
            <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${
                  progress >= 100 ? 'bg-green-500' : 
                  progress >= 75 ? 'bg-blue-500' : 
                  progress >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white">Key Performance Indicators</h2>
          <p className="text-gray-400 mt-1">Track and monitor critical business metrics</p>
        </div>
        <DateRangePicker
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          onChange={updateFilters}
          onQuickSelect={setDateRange}
        />
      </div>

      {/* User Engagement KPIs */}
      <div>
        <h3 className="text-xl font-bold text-white mb-4">User Engagement</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <KPICard
            title="Daily Active Users (DAU)"
            value={formatNumber(kpis.dau || 0)}
            trend={kpis.dau_trend}
            target={kpis.dau_target}
          />
          <KPICard
            title="Monthly Active Users (MAU)"
            value={formatNumber(kpis.mau || 0)}
            trend={kpis.mau_trend}
            target={kpis.mau_target}
          />
          <KPICard
            title="DAU/MAU Ratio"
            value={formatPercentage((kpis.dau / kpis.mau) * 100 || 0)}
            subtitle="Stickiness metric"
            trend={kpis.stickiness_trend}
          />
        </div>
      </div>

      {/* Financial KPIs */}
      <div>
        <h3 className="text-xl font-bold text-white mb-4">Financial Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <KPICard
            title="Customer Acquisition Cost (CAC)"
            value={formatCurrency(kpis.cac || 0)}
            trend={kpis.cac_trend}
            subtitle="Cost per new user"
          />
          <KPICard
            title="Lifetime Value (LTV)"
            value={formatCurrency(kpis.ltv || 0)}
            trend={kpis.ltv_trend}
            subtitle="Average revenue per user"
          />
          <KPICard
            title="LTV/CAC Ratio"
            value={(kpis.ltv / kpis.cac || 0).toFixed(2)}
            subtitle="Should be > 3.0"
            trend={kpis.ltv_cac_ratio_trend}
          />
          <KPICard
            title="Average Revenue Per User"
            value={formatCurrency(kpis.arpu || 0)}
            trend={kpis.arpu_trend}
          />
        </div>
      </div>

      {/* Operational KPIs */}
      <div>
        <h3 className="text-xl font-bold text-white mb-4">Operational Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <KPICard
            title="Transaction Success Rate"
            value={formatPercentage(kpis.transaction_success_rate || 0)}
            trend={kpis.success_rate_trend}
            target={95}
            subtitle="Target: 95%"
          />
          <KPICard
            title="Churn Rate"
            value={formatPercentage(kpis.churn_rate || 0)}
            trend={-kpis.churn_rate_trend}
            subtitle="Lower is better"
          />
          <KPICard
            title="User Retention (30-day)"
            value={formatPercentage(kpis.retention_rate || 0)}
            trend={kpis.retention_trend}
            target={80}
          />
        </div>
      </div>

      {/* Growth Metrics */}
      <div>
        <h3 className="text-xl font-bold text-white mb-4">Growth Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <KPICard
            title="User Growth Rate"
            value={formatPercentage(kpis.user_growth_rate || 0)}
            trend={kpis.user_growth_trend}
            subtitle="Month over month"
          />
          <KPICard
            title="Revenue Growth Rate"
            value={formatPercentage(kpis.revenue_growth_rate || 0)}
            trend={kpis.revenue_growth_trend}
            subtitle="Month over month"
          />
          <KPICard
            title="Transaction Growth Rate"
            value={formatPercentage(kpis.transaction_growth_rate || 0)}
            trend={kpis.transaction_growth_trend}
            subtitle="Month over month"
          />
        </div>
      </div>

      {/* Summary Section */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-bold text-white mb-4">Performance Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-green-500 font-bold mb-3">Strengths</h4>
            <ul className="space-y-2 text-gray-300">
              {kpis.transaction_success_rate >= 90 && (
                <li>✓ High transaction success rate</li>
              )}
              {(kpis.ltv / kpis.cac) > 3 && (
                <li>✓ Healthy LTV/CAC ratio</li>
              )}
              {kpis.user_growth_rate > 5 && (
                <li>✓ Strong user growth</li>
              )}
              {kpis.retention_rate > 70 && (
                <li>✓ Good user retention</li>
              )}
            </ul>
          </div>
          <div>
            <h4 className="text-yellow-500 font-bold mb-3">Areas for Improvement</h4>
            <ul className="space-y-2 text-gray-300">
              {kpis.churn_rate > 10 && (
                <li>⚠ High churn rate - focus on retention</li>
              )}
              {(kpis.ltv / kpis.cac) < 3 && (
                <li>⚠ Low LTV/CAC ratio - optimize acquisition</li>
              )}
              {kpis.transaction_success_rate < 90 && (
                <li>⚠ Transaction success rate below target</li>
              )}
              {kpis.user_growth_rate < 2 && (
                <li>⚠ Slow user growth - increase marketing</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KPIsAnalytics;
