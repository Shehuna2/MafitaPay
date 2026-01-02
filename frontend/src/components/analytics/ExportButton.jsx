import { FiDownload } from 'react-icons/fi';
import { exportToCSV } from '../../services/formatters';

/**
 * ExportButton - Button to export data to CSV
 */
const ExportButton = ({ 
  data, 
  filename = 'export.csv',
  disabled = false,
  className = ''
}) => {
  const handleExport = () => {
    if (!data || data.length === 0) {
      alert('No data to export');
      return;
    }
    exportToCSV(data, filename);
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled || !data || data.length === 0}
      className={`flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 
        disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg 
        transition-colors ${className}`}
    >
      <FiDownload />
      <span>Export CSV</span>
    </button>
  );
};

export default ExportButton;
