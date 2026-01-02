import { useState, useCallback } from 'react';
import { format, subDays } from 'date-fns';

/**
 * Hook for managing analytics filters
 */
export const useFilters = (initialFilters = {}) => {
  const [filters, setFilters] = useState({
    dateFrom: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    dateTo: format(new Date(), 'yyyy-MM-dd'),
    ...initialFilters,
  });

  const updateFilter = useCallback((key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const updateFilters = useCallback((newFilters) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters,
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      dateFrom: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
      dateTo: format(new Date(), 'yyyy-MM-dd'),
      ...initialFilters,
    });
  }, [initialFilters]);

  const setDateRange = useCallback((range) => {
    const now = new Date();
    let dateFrom;

    switch (range) {
      case 'today':
        dateFrom = format(now, 'yyyy-MM-dd');
        break;
      case 'yesterday':
        dateFrom = format(subDays(now, 1), 'yyyy-MM-dd');
        break;
      case 'week':
        dateFrom = format(subDays(now, 7), 'yyyy-MM-dd');
        break;
      case 'month':
        dateFrom = format(subDays(now, 30), 'yyyy-MM-dd');
        break;
      case 'quarter':
        dateFrom = format(subDays(now, 90), 'yyyy-MM-dd');
        break;
      case 'year':
        dateFrom = format(subDays(now, 365), 'yyyy-MM-dd');
        break;
      default:
        return;
    }

    setFilters(prev => ({
      ...prev,
      dateFrom,
      dateTo: format(now, 'yyyy-MM-dd'),
    }));
  }, []);

  return {
    filters,
    updateFilter,
    updateFilters,
    resetFilters,
    setDateRange,
  };
};
