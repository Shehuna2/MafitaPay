// frontend/src/components/PIN/PINVerificationModal.jsx
import React, { useState, useEffect } from 'react';
import { XIcon, AlertCircleIcon, ShieldCheckIcon } from 'lucide-react';
import PINInput from './PINInput';
import axios from 'axios';
import toast from 'react-hot-toast';
import useBiometricAuth from '../../hooks/useBiometricAuth';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

/**
 * PINVerificationModal Component
 * Modal for verifying PIN before sensitive transactions
 * 
 * @param {Boolean} isOpen - Whether modal is open
 * @param {Function} onClose - Close callback
 * @param {Function} onVerified - Callback when PIN is successfully verified
 * @param {Object} transactionDetails - Details of the transaction to display
 */
const PINVerificationModal = ({ 
  isOpen, 
  onClose, 
  onVerified, 
  transactionDetails = null 
}) => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(5);
  const [biometricLoading, setBiometricLoading] = useState(false);
  
  const { isSupported, biometricStatus, verifyBiometric } = useBiometricAuth();

  useEffect(() => {
    if (!isOpen) {
      setError('');
      setAttemptsLeft(5);
      setBiometricLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBiometricVerification = async () => {
    setError('');
    setBiometricLoading(true);

    try {
      const result = await verifyBiometric();
      
      if (result.success) {
        toast.success('Biometric verification successful!');
        
        // Call onVerified callback
        // Note: We pass null for the PIN parameter since biometric was used
        // Consumers should handle both PIN (string) and biometric (null) verification
        if (onVerified) {
          onVerified(null);
        }
        
        onClose();
      } else {
        throw new Error(result.error || 'Biometric verification failed');
      }
    } catch (err) {
      const errorMsg = err.message || 'Biometric verification failed. Please use PIN instead.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setBiometricLoading(false);
    }
  };

  const handlePinComplete = async (pin) => {
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('access');
      const response = await axios.post(
        `${API_BASE}/pin/verify/`,
        { pin },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        toast.success('PIN verified successfully!');
        
        // Call onVerified callback with the PIN
        if (onVerified) {
          onVerified(pin);
        }
        
        onClose();
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to verify PIN';
      const attemptsRemaining = err.response?.data?.attempts_left;
      
      setError(errorMsg);
      toast.error(errorMsg);
      
      if (attemptsRemaining !== undefined) {
        setAttemptsLeft(attemptsRemaining);
      }

      // If PIN is locked or no attempts left, close modal after delay
      if (attemptsRemaining === 0 || errorMsg.includes('locked')) {
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="
        fixed inset-0 z-50
        bg-black/60 backdrop-blur-sm
        flex items-end sm:items-center justify-center
        px-3
        pb-[env(safe-area-inset-bottom)]
        pt-[env(safe-area-inset-top)]
      "
    >
      <div
        className="
          bg-white dark:bg-gray-900
          w-full sm:max-w-md
          rounded-t-2xl sm:rounded-2xl
          shadow-2xl
          max-h-[85vh]
          overflow-hidden
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-green-100 dark:bg-green-900/30">
              <ShieldCheckIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">
              Verify Transaction
            </h2>
          </div>
          {!loading && !biometricLoading && (
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <XIcon className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto px-4 py-4 space-y-5">
          {/* Transaction Details */}
          {transactionDetails && (
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Transaction Details</h3>
              
              {transactionDetails.type && (
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Type:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100 capitalize">
                    {transactionDetails.type}
                  </span>
                </div>
              )}
              
              {transactionDetails.amount && (
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Amount:</span>
                  <span className="font-bold text-gray-900 dark:text-gray-100 text-base sm:text-lg">
                    ₦{Number(transactionDetails.amount).toLocaleString()}
                  </span>
                </div>
              )}
              
              {transactionDetails.recipient && (
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Recipient:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {transactionDetails.recipient}
                  </span>
                </div>
              )}
              
              {transactionDetails.description && (
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Description:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {transactionDetails.description}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Security Notice */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <p className="text-xs sm:text-sm text-yellow-800 dark:text-yellow-200">
              <strong>⚠️ Security Check:</strong> {biometricLoading ? 'Verifying biometric...' : 'Enter your transaction PIN or use biometric authentication to authorize this transaction.'}
            </p>
          </div>

          {/* PIN Input */}
          <PINInput
            title="Enter Transaction PIN"
            onComplete={handlePinComplete}
            error={error}
            loading={loading}
            showKeypad={true}
            autoFocus={true}
            showBiometric={isSupported && biometricStatus.enabled && !biometricStatus.loading}
            onBiometricClick={handleBiometricVerification}
            biometricLoading={biometricLoading}
          />

          {/* Attempts Counter */}
          {attemptsLeft < 5 && attemptsLeft > 0 && (
            <div className="text-center">
              <p className="text-xs sm:text-sm text-orange-600 dark:text-orange-400 font-medium">
                {attemptsLeft} {attemptsLeft === 1 ? 'attempt' : 'attempts'} remaining
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4">
          <div className="flex items-start gap-2 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
            <AlertCircleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              Your PIN is required to complete this transaction. After 5 failed attempts,
              your PIN will be locked for 30 minutes for security reasons.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PINVerificationModal;
