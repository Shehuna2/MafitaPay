import client from "../api/client";

/**
 * Analytics Service - API calls for CEO Analytics Dashboard
 */

// Overview Analytics
export const getOverviewAnalytics = async (params = {}) => {
  const { data } = await client.get("/analytics/dashboard/overview/", { params });
  return data;
};

// Transaction Analytics
export const getTransactionAnalytics = async (params = {}) => {
  const { data } = await client.get("/analytics/transactions/", { params });
  return data;
};

// Revenue Analytics
export const getRevenueAnalytics = async (params = {}) => {
  const { data } = await client.get("/analytics/revenue/", { params });
  return data;
};

// User Analytics
export const getUserAnalytics = async (params = {}) => {
  const { data } = await client.get("/analytics/users/", { params });
  return data;
};

// Service Analytics
export const getServiceAnalytics = async (params = {}) => {
  const { data } = await client.get("/analytics/services/", { params });
  return data;
};

// KPI Analytics
export const getKPIAnalytics = async (params = {}) => {
  const { data } = await client.get("/analytics/kpis/", { params });
  return data;
};

// Export Report
export const exportReport = async (params = {}) => {
  const { data } = await client.get("/analytics/reports/export/", { 
    params,
    responseType: 'blob'
  });
  return data;
};
