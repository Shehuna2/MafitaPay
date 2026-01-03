import { useState } from 'react';
import { FiDownload, FiFileText } from 'react-icons/fi';
import DateRangePicker from '../../components/analytics/DateRangePicker';
import { useFilters } from '../../hooks/useFilters';
import { exportReport } from '../../services/analyticsService';
import { formatDate } from '../../services/formatters';

/**
 * ReportsAnalytics - Report generation and export
 */
const ReportsAnalytics = () => {
  const { filters, updateFilters, setDateRange } = useFilters();
  const [reportType, setReportType] = useState('daily');
  const [format, setFormat] = useState('csv');
  const [generating, setGenerating] = useState(false);
  const [reportHistory, setReportHistory] = useState([]);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  const [selectedMetrics, setSelectedMetrics] = useState({
    transactions: true,
    revenue: true,
    users: true,
    services: true,
    kpis: true,
  });

  const handleMetricToggle = (metric) => {
    setSelectedMetrics(prev => ({
      ...prev,
      [metric]: !prev[metric],
    }));
  };

  const handleGenerateReport = async () => {
    setGenerating(true);
    setMessage({ type: '', text: '' });

    try {
      const params = {
        date_from: filters.dateFrom,
        date_to: filters.dateTo,
        report_type: reportType,
        format: format,
        metrics: Object.keys(selectedMetrics).filter(key => selectedMetrics[key]).join(','),
      };

      const blob = await exportReport(params);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `analytics_report_${filters.dateFrom}_to_${filters.dateTo}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      // Add to history
      const newReport = {
        id: Date.now(),
        type: reportType,
        format: format,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        generatedAt: new Date().toISOString(),
        metrics: Object.keys(selectedMetrics).filter(key => selectedMetrics[key]),
      };
      setReportHistory(prev => [newReport, ...prev]);

      setMessage({ type: 'success', text: 'Report generated successfully!' });
    } catch (error) {
      console.error('Failed to generate report:', error);
      setMessage({ type: 'error', text: 'Failed to generate report. Please try again.' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="section-gap">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-white">Reports</h2>
        <p className="text-gray-400 mt-1">Generate and export analytics reports</p>
      </div>

      {/* Message Display */}
      {message.text && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-900/20 border border-green-500 text-green-100' :
          'bg-red-900/20 border border-red-500 text-red-100'
        }`}>
          {message.text}
        </div>
      )}

      {/* Report Configuration */}
      <div className="glass-panel p-6 space-y-6">
        <h3 className="text-xl font-bold text-white">Report Configuration</h3>

        {/* Date Range */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Date Range
          </label>
          <DateRangePicker
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            onChange={updateFilters}
            onQuickSelect={setDateRange}
          />
        </div>

        {/* Report Type */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Report Type
          </label>
          <div className="flex flex-wrap gap-3">
            {['daily', 'weekly', 'monthly', 'custom'].map(type => (
              <button
                key={type}
                onClick={() => setReportType(type)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  reportType === type
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Export Format */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Export Format
          </label>
          <div className="flex gap-3">
            {['csv', 'json'].map(fmt => (
              <button
                key={fmt}
                onClick={() => setFormat(fmt)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  format === fmt
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10'
                }`}
              >
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Metrics Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Include Metrics
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Object.keys(selectedMetrics).map(metric => (
              <label
                key={metric}
                className="flex items-center gap-3 p-3 glass-card cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedMetrics[metric]}
                  onChange={() => handleMetricToggle(metric)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-white capitalize">{metric}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerateReport}
          disabled={generating || !Object.values(selectedMetrics).some(v => v)}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 
            bg-gradient-to-r from-blue-600 to-cyan-600 hover:shadow-lg
            disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed
            text-white font-medium rounded-lg transition-all"
        >
          <FiDownload />
          {generating ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {/* Report History */}
      <div className="glass-panel p-6">
        <h3 className="text-xl font-bold text-white mb-4">Report History</h3>
        
        {reportHistory.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No reports generated yet</p>
        ) : (
          <div className="space-y-3">
            {reportHistory.map(report => (
              <div 
                key={report.id}
                className="flex flex-col md:flex-row md:items-center md:justify-between p-4 glass-card gap-4"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-lg flex-shrink-0">
                    <FiFileText className="text-white" size={20} />
                  </div>
                  <div>
                    <h4 className="text-white font-medium">
                      {report.type.charAt(0).toUpperCase() + report.type.slice(1)} Report
                    </h4>
                    <p className="text-gray-400 text-sm">
                      {formatDate(report.dateFrom)} - {formatDate(report.dateTo)}
                    </p>
                    <p className="text-gray-500 text-xs">
                      Generated {formatDate(report.generatedAt, 'MMM dd, yyyy HH:mm')}
                    </p>
                  </div>
                </div>
                <div className="text-left md:text-right">
                  <span className="inline-block px-3 py-1 bg-white/10 text-white text-xs rounded-full">
                    {report.format.toUpperCase()}
                  </span>
                  <p className="text-gray-400 text-xs mt-1">
                    {report.metrics.length} metrics
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Information */}
      <div className="glass-panel p-4 border-l-4 border-blue-500">
        <h4 className="text-blue-400 font-medium mb-2">ℹ️ Report Information</h4>
        <ul className="text-gray-300 text-sm space-y-1">
          <li>• Reports are generated based on the selected date range and metrics</li>
          <li>• CSV format is recommended for Excel and spreadsheet applications</li>
          <li>• JSON format is recommended for programmatic processing</li>
          <li>• Large date ranges may take longer to generate</li>
        </ul>
      </div>
    </div>
  );
};

export default ReportsAnalytics;
