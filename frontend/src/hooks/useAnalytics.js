import { useQuery } from '@tanstack/react-query';
import {
  getOverviewAnalytics,
  getTransactionAnalytics,
  getRevenueAnalytics,
  getUserAnalytics,
  getServiceAnalytics,
  getKPIAnalytics,
} from '../services/analyticsService';

/**
 * Hook for fetching overview analytics
 */
export const useOverviewAnalytics = (params = {}, options = {}) => {
  return useQuery({
    queryKey: ['analytics', 'overview', params],
    queryFn: () => getOverviewAnalytics(params),
    staleTime: 30000, // 30 seconds
    ...options,
  });
};

/**
 * Hook for fetching transaction analytics
 */
export const useTransactionAnalytics = (params = {}, options = {}) => {
  return useQuery({
    queryKey: ['analytics', 'transactions', params],
    queryFn: () => getTransactionAnalytics(params),
    staleTime: 30000,
    ...options,
  });
};

/**
 * Hook for fetching revenue analytics
 */
export const useRevenueAnalytics = (params = {}, options = {}) => {
  return useQuery({
    queryKey: ['analytics', 'revenue', params],
    queryFn: () => getRevenueAnalytics(params),
    staleTime: 30000,
    ...options,
  });
};

/**
 * Hook for fetching user analytics
 */
export const useUserAnalytics = (params = {}, options = {}) => {
  return useQuery({
    queryKey: ['analytics', 'users', params],
    queryFn: () => getUserAnalytics(params),
    staleTime: 30000,
    ...options,
  });
};

/**
 * Hook for fetching service analytics
 */
export const useServiceAnalytics = (params = {}, options = {}) => {
  return useQuery({
    queryKey: ['analytics', 'services', params],
    queryFn: () => getServiceAnalytics(params),
    staleTime: 30000,
    ...options,
  });
};

/**
 * Hook for fetching KPI analytics
 */
export const useKPIAnalytics = (params = {}, options = {}) => {
  return useQuery({
    queryKey: ['analytics', 'kpis', params],
    queryFn: () => getKPIAnalytics(params),
    staleTime: 30000,
    ...options,
  });
};
