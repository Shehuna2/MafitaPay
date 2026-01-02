import { useState } from 'react';
import { format } from 'date-fns';

/**
 * DateRangePicker - Component for selecting date ranges
 */
const DateRangePicker = ({ 
  dateFrom, 
  dateTo, 
  onChange,
  onQuickSelect 
}) => {
  const [showCustom, setShowCustom] = useState(false);

  const quickRanges = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'Last 7 days', value: 'week' },
    { label: 'Last 30 days', value: 'month' },
    { label: 'Last 90 days', value: 'quarter' },
    { label: 'Last year', value: 'year' },
  ];

  const handleQuickSelect = (range) => {
    setShowCustom(false);
    if (onQuickSelect) {
      onQuickSelect(range);
    }
  };

  return (
    <div className="flex flex-wrap gap-4 items-center">
      <div className="flex gap-2">
        {quickRanges.map(range => (
          <button
            key={range.value}
            onClick={() => handleQuickSelect(range.value)}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white 
              text-sm rounded-lg transition-colors"
          >
            {range.label}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(!showCustom)}
          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white 
            text-sm rounded-lg transition-colors"
        >
          Custom
        </button>
      </div>

      {showCustom && (
        <div className="flex gap-4 items-center">
          <div>
            <label className="block text-sm text-gray-400 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onChange({ dateFrom: e.target.value, dateTo })}
              max={dateTo}
              className="px-3 py-2 bg-gray-700 text-white rounded-lg 
                border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onChange({ dateFrom, dateTo: e.target.value })}
              min={dateFrom}
              max={format(new Date(), 'yyyy-MM-dd')}
              className="px-3 py-2 bg-gray-700 text-white rounded-lg 
                border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;
