import { useState } from 'react';
import { FiDownload, FiFileText } from 'react-icons/fi';
import DateRangePicker from '../../components/analytics/DateRangePicker';
import { useFilters } from '../../hooks/useFilters';
import { exportReport } from '../../services/analyticsService';
import { formatDate } from '../../services/formatters';
import toast from 'react-hot-toast';

/**
 * ReportsAnalytics - Report generation and export
 */
const ReportsAnalytics = () => {
  const { filters, updateFilters, setDateRange } = useFilters();
  const [reportType, setReportType] = useState('daily');
  const [format, setFormat] = useState('csv');
  const [generating, setGenerating] = useState(false);
  const [reportHistory, setReportHistory] = useState([]);
  
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

      toast.success('Report generated successfully!');
    } catch (error) {
      console.error('Failed to generate report:', error);
      toast.error('Failed to generate report. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-3xl font-bold text-white">Reports</h2>
        <p className="text-gray-400 mt-1">Generate and export analytics reports</p>
      </div>

      {/* Report Configuration */}
      <div className="bg-gray-800 rounded-lg p-6 space-y-6">
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
          <div className="flex gap-4">
            {['daily', 'weekly', 'monthly', 'custom'].map(type => (
              <button
                key={type}
                onClick={() => setReportType(type)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  reportType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
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
          <div className="flex gap-4">
            {['csv', 'json'].map(fmt => (
              <button
                key={fmt}
                onClick={() => setFormat(fmt)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  format === fmt
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.keys(selectedMetrics).map(metric => (
              <label
                key={metric}
                className="flex items-center gap-3 p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600"
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
            bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed
            text-white font-medium rounded-lg transition-colors"
        >
          <FiDownload />
          {generating ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {/* Report History */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-bold text-white mb-4">Report History</h3>
        
        {reportHistory.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No reports generated yet</p>
        ) : (
          <div className="space-y-3">
            {reportHistory.map(report => (
              <div 
                key={report.id}
                className="flex items-center justify-between p-4 bg-gray-700 rounded-lg hover:bg-gray-650 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-blue-600 rounded-lg">
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
                <div className="text-right">
                  <span className="inline-block px-3 py-1 bg-gray-600 text-white text-xs rounded-full">
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
      <div className="bg-blue-900 bg-opacity-20 border border-blue-500 rounded-lg p-4">
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
