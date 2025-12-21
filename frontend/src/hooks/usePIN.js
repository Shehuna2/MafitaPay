// frontend/src/hooks/usePIN.js
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

/**
 * Custom hook for managing transaction PIN
 * Provides functions to check PIN status, setup, verify, and change PIN
 */
export const usePIN = () => {
  const [pinStatus, setPinStatus] = useState({
    hasPin: false,
    isLocked: false,
    lastChanged: null,
    loading: true,
  });

  // Fetch PIN status
  const fetchPINStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('access');
      if (!token) {
        setPinStatus({ hasPin: false, isLocked: false, lastChanged: null, loading: false });
        return;
      }

      const response = await axios.get(`${API_BASE}/pin/status/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setPinStatus({
        hasPin: response.data.has_pin,
        isLocked: response.data.is_locked,
        lastChanged: response.data.last_changed,
        loading: false,
      });
    } catch (error) {
      console.error('Error fetching PIN status:', error);
      setPinStatus((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  // Setup new PIN
  const setupPIN = useCallback(async (pin, pinConfirmation) => {
    try {
      const token = localStorage.getItem('access');
      const response = await axios.post(
        `${API_BASE}/pin/setup/`,
        { pin, pin_confirmation: pinConfirmation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success) {
        toast.success('Transaction PIN set up successfully!');
        await fetchPINStatus(); // Refresh status
        return { success: true };
      }
    } catch (error) {
      const errorMsg =
        error.response?.data?.error ||
        error.response?.data?.pin?.[0] ||
        error.response?.data?.pin_confirmation?.[0] ||
        'Failed to set up PIN';
      toast.error(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, [fetchPINStatus]);

  // Verify PIN
  const verifyPIN = useCallback(async (pin) => {
    try {
      const token = localStorage.getItem('access');
      const response = await axios.post(
        `${API_BASE}/pin/verify/`,
        { pin },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success) {
        return { success: true };
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to verify PIN';
      const attemptsLeft = error.response?.data?.attempts_left;
      
      return { 
        success: false, 
        error: errorMsg,
        attemptsLeft 
      };
    }
  }, []);

  // Change PIN
  const changePIN = useCallback(async (oldPin, newPin, newPinConfirmation) => {
    try {
      const token = localStorage.getItem('access');
      const response = await axios.post(
        `${API_BASE}/pin/change/`,
        { 
          old_pin: oldPin, 
          new_pin: newPin, 
          new_pin_confirmation: newPinConfirmation 
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success) {
        toast.success('Transaction PIN changed successfully!');
        await fetchPINStatus(); // Refresh status
        return { success: true };
      }
    } catch (error) {
      const errorMsg =
        error.response?.data?.error ||
        error.response?.data?.old_pin?.[0] ||
        error.response?.data?.new_pin?.[0] ||
        error.response?.data?.new_pin_confirmation?.[0] ||
        'Failed to change PIN';
      toast.error(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, [fetchPINStatus]);

  // Request PIN reset
  const requestPINReset = useCallback(async (email) => {
    try {
      const response = await axios.post(
        `${API_BASE}/pin/reset/request/`,
        { email },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success) {
        toast.success('PIN reset email sent. Please check your inbox.');
        return { success: true };
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to request PIN reset';
      toast.error(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, []);

  // Confirm PIN reset with token
  const confirmPINReset = useCallback(async (token, newPin, newPinConfirmation) => {
    try {
      const response = await axios.post(
        `${API_BASE}/pin/reset/confirm/`,
        { 
          token, 
          new_pin: newPin, 
          new_pin_confirmation: newPinConfirmation 
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success) {
        toast.success('Transaction PIN reset successfully!');
        return { success: true };
      }
    } catch (error) {
      const errorMsg =
        error.response?.data?.error ||
        error.response?.data?.new_pin?.[0] ||
        error.response?.data?.new_pin_confirmation?.[0] ||
        'Failed to reset PIN';
      toast.error(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, []);

  // Fetch status on mount
  useEffect(() => {
    fetchPINStatus();
  }, [fetchPINStatus]);

  return {
    pinStatus,
    setupPIN,
    verifyPIN,
    changePIN,
    requestPINReset,
    confirmPINReset,
    refreshPINStatus: fetchPINStatus,
  };
};

export default usePIN;
