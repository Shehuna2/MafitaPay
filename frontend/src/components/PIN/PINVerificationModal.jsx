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
        bg-black/70 backdrop-blur-md
        flex items-end sm:items-center justify-center
        px-3
        pb-[env(safe-area-inset-bottom)]
        pt-[env(safe-area-inset-top)]
        animate-in fade-in duration-200
      "
    >
      <div
        className="
          bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900
          w-full sm:max-w-sm
          rounded-t-3xl sm:rounded-3xl
          shadow-2xl shadow-indigo-500/20
          border border-gray-700/50
          max-h-[80vh]
          overflow-hidden
          animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300
        "
      >
        {/* Premium Header with Gradient */}
        <div className="relative px-4 py-3 bg-gradient-to-r from-indigo-600/20 via-purple-600/20 to-pink-600/20 border-b border-gray-700/50 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30">
                <ShieldCheckIcon className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-sm font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                Verify Transaction
              </h2>
            </div>
            {!loading && !biometricLoading && (
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-white/10 transition-all duration-200 active:scale-95"
              >
                <XIcon className="w-4 h-4 text-gray-400 hover:text-white" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto px-4 py-3 space-y-3">
          {/* Transaction Details - Premium Card */}
          {transactionDetails && (
            <div className="relative overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700/50 rounded-xl p-3 space-y-2 shadow-lg">
              {/* Subtle gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 pointer-events-none" />
              
              <div className="relative space-y-2">
                <h3 className="text-xs font-bold text-gray-300 mb-2 flex items-center gap-1">
                  <span className="w-1 h-3 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-full" />
                  Transaction Details
                </h3>
                
                {transactionDetails.type && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Type:</span>
                    <span className="font-medium text-gray-200 capitalize">
                      {transactionDetails.type}
                    </span>
                  </div>
                )}
                
                {transactionDetails.amount && (
                  <div className="flex justify-between text-xs items-center">
                    <span className="text-gray-400">Amount:</span>
                    <span className="font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent text-base">
                      ₦{Number(transactionDetails.amount).toLocaleString()}
                    </span>
                  </div>
                )}
                
                {transactionDetails.recipient && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Recipient:</span>
                    <span className="font-medium text-gray-200 truncate ml-2 max-w-[60%]">
                      {transactionDetails.recipient}
                    </span>
                  </div>
                )}
                
                {transactionDetails.description && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Description:</span>
                    <span className="font-medium text-gray-200 truncate ml-2 max-w-[60%]">
                      {transactionDetails.description}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Security Notice - Premium Style */}
          <div className="relative overflow-hidden bg-gradient-to-br from-amber-900/30 to-orange-900/30 border border-amber-600/30 rounded-xl p-2.5 backdrop-blur-sm">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-orange-500/5 pointer-events-none" />
            <p className="relative text-[11px] text-amber-200/90 flex items-start gap-1.5">
              <span className="text-amber-400 text-sm mt-0.5">⚠️</span>
              <span>
                <strong className="text-amber-300">Security Check:</strong>{' '}
                {biometricLoading ? 'Verifying biometric...' : 'Enter your transaction PIN or use biometric authentication to authorize this transaction.'}
              </span>
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
            showBiometric={isSupported && biometricStatus && biometricStatus.enabled && !biometricStatus.loading}
            onBiometricClick={handleBiometricVerification}
            biometricLoading={biometricLoading}
          />

          {/* Attempts Counter - Premium Style */}
          {attemptsLeft < 5 && attemptsLeft > 0 && (
            <div className="text-center py-1">
              <p className="text-xs font-semibold bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
                {attemptsLeft} {attemptsLeft === 1 ? 'attempt' : 'attempts'} remaining
              </p>
            </div>
          )}
        </div>

        {/* Premium Footer */}
        <div className="px-4 pb-3 pt-2 bg-gray-900/50 backdrop-blur-sm border-t border-gray-700/30">
          <div className="flex items-start gap-2 text-[10px] text-gray-400">
            <AlertCircleIcon className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-500" />
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
