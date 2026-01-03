import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

/**
 * AnalyticsLineChart - Reusable line chart component
 */
const AnalyticsLineChart = ({ 
  data, 
  lines = [], 
  xKey = 'date',
  height = 300,
  loading = false
}) => {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#14b8a6'];

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-gray-800 to-gray-850 rounded-xl p-6 border border-gray-700/50 shadow-xl animate-pulse">
        <div className="h-64 bg-gray-700/50 rounded-lg"></div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-gradient-to-br from-gray-800 to-gray-850 rounded-xl p-6 border border-gray-700/50 shadow-xl flex items-center justify-center h-64">
        <p className="text-gray-400">No data available</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-850 rounded-xl p-6 border border-gray-700/50 shadow-xl">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey={xKey} 
            stroke="#9ca3af"
            tick={{ fill: '#9ca3af' }}
          />
          <YAxis 
            stroke="#9ca3af"
            tick={{ fill: '#9ca3af' }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1f2937', 
              border: '1px solid #374151',
              borderRadius: '0.375rem'
            }}
            labelStyle={{ color: '#f3f4f6' }}
          />
          <Legend 
            wrapperStyle={{ color: '#9ca3af' }}
          />
          {lines.map((line, index) => (
            <Line
              key={line.dataKey}
              type="monotone"
              dataKey={line.dataKey}
              name={line.name || line.dataKey}
              stroke={line.color || colors[index % colors.length]}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AnalyticsLineChart;
