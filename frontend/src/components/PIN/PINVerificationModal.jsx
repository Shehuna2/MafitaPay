// frontend/src/components/PIN/PINVerificationModal.jsx
import React, { useState, useEffect } from 'react';
import { XIcon, AlertCircleIcon, ShieldCheckIcon } from 'lucide-react';
import PINInput from './PINInput';
import axios from 'axios';
import toast from 'react-hot-toast';

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

  useEffect(() => {
    if (!isOpen) {
      setError('');
      setAttemptsLeft(5);
    }
  }, [isOpen]);

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <div className="bg-green-100 p-2 rounded-full">
              <ShieldCheckIcon className="w-6 h-6 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">
              Verify Transaction
            </h2>
          </div>
          {!loading && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <XIcon className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Transaction Details */}
          {transactionDetails && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
              <h3 className="font-semibold text-gray-900 mb-2">Transaction Details</h3>
              
              {transactionDetails.type && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Type:</span>
                  <span className="font-medium text-gray-900 capitalize">
                    {transactionDetails.type}
                  </span>
                </div>
              )}
              
              {transactionDetails.amount && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Amount:</span>
                  <span className="font-bold text-gray-900 text-lg">
                    ₦{Number(transactionDetails.amount).toLocaleString()}
                  </span>
                </div>
              )}
              
              {transactionDetails.recipient && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Recipient:</span>
                  <span className="font-medium text-gray-900">
                    {transactionDetails.recipient}
                  </span>
                </div>
              )}
              
              {transactionDetails.description && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Description:</span>
                  <span className="font-medium text-gray-900">
                    {transactionDetails.description}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Security Notice */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800">
              <strong>⚠️ Security Check:</strong> Enter your transaction PIN to authorize this transaction.
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
          />

          {/* Attempts Counter */}
          {attemptsLeft < 5 && attemptsLeft > 0 && (
            <div className="text-center">
              <p className="text-sm text-orange-600 font-medium">
                {attemptsLeft} {attemptsLeft === 1 ? 'attempt' : 'attempts'} remaining
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <div className="flex items-start space-x-2 text-xs text-gray-500">
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
