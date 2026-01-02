import { FiTrendingUp, FiTrendingDown } from 'react-icons/fi';

/**
 * MetricCard - Display a single metric with optional trend
 */
const MetricCard = ({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  trendValue,
  subtitle,
  loading = false,
  color = 'blue'
}) => {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
    pink: 'from-pink-500 to-pink-600',
    indigo: 'from-indigo-500 to-indigo-600',
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 animate-pulse">
        <div className="h-4 bg-gray-700 rounded w-1/2 mb-4"></div>
        <div className="h-8 bg-gray-700 rounded w-3/4 mb-2"></div>
        <div className="h-3 bg-gray-700 rounded w-1/3"></div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-gray-400 text-sm font-medium mb-2">{title}</p>
          <h3 className="text-3xl font-bold text-white mb-1">{value}</h3>
          
          {subtitle && (
            <p className="text-gray-500 text-xs">{subtitle}</p>
          )}
          
          {trend !== undefined && (
            <div className="flex items-center mt-2">
              {trend > 0 ? (
                <FiTrendingUp className="text-green-500 mr-1" />
              ) : (
                <FiTrendingDown className="text-red-500 mr-1" />
              )}
              <span className={`text-sm ${trend > 0 ? 'text-green-500' : 'text-red-500'}`}>
                {trendValue || `${Math.abs(trend)}%`}
              </span>
              <span className="text-gray-500 text-xs ml-2">vs last period</span>
            </div>
          )}
        </div>
        
        {Icon && (
          <div className={`p-3 rounded-lg bg-gradient-to-br ${colorClasses[color] || colorClasses.blue}`}>
            <Icon className="text-white text-2xl" />
          </div>
        )}
      </div>
    </div>
  );
};

export default MetricCard;
