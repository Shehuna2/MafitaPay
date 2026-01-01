import { useState, useEffect } from 'react';
import axios from 'axios';

const BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000/api").replace(/\/$/, "");

/**
 * Hook to check maintenance status
 * Polls the maintenance status endpoint periodically
 */
const useMaintenanceCheck = (pollInterval = 30000) => {
  const [maintenanceStatus, setMaintenanceStatus] = useState({
    isLoading: true,
    isMaintenanceMode: false,
    maintenanceData: null,
    error: null,
  });

  const checkMaintenanceStatus = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/maintenance-status/`);
      
      setMaintenanceStatus({
        isLoading: false,
        isMaintenanceMode: response.data.maintenance_enabled,
        maintenanceData: response.data,
        error: null,
      });
    } catch (error) {
      // If we get a 503, it means we're in maintenance mode
      if (error.response?.status === 503) {
        setMaintenanceStatus({
          isLoading: false,
          isMaintenanceMode: true,
          maintenanceData: error.response.data,
          error: null,
        });
      } else {
        console.error('Error checking maintenance status:', error);
        setMaintenanceStatus(prev => ({
          ...prev,
          isLoading: false,
          error: error.message,
        }));
      }
    }
  };

  useEffect(() => {
    // Check immediately on mount
    checkMaintenanceStatus();

    // Set up polling interval if specified
    if (pollInterval > 0) {
      const interval = setInterval(checkMaintenanceStatus, pollInterval);
      return () => clearInterval(interval);
    }
  }, [pollInterval]);

  return {
    ...maintenanceStatus,
    refetch: checkMaintenanceStatus,
  };
};

export default useMaintenanceCheck;
