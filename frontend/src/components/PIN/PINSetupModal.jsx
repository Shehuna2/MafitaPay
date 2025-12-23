// frontend/src/components/PIN/PINSetupModal.jsx
import React, { useState } from 'react';
import { XIcon, CheckCircleIcon, AlertCircleIcon, ShieldIcon } from 'lucide-react';
import PINInput from './PINInput';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

/**
 * PINSetupModal Component
 * Modal for first-time PIN setup with confirmation
 */
const PINSetupModal = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState(1); // 1: Enter PIN, 2: Confirm PIN, 3: Success
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handlePinComplete = (enteredPin) => {
    setPin(enteredPin);
    setError('');
    // Move to confirmation step
    setTimeout(() => {
      setStep(2);
    }, 300);
  };

  const handleConfirmPinComplete = async (enteredConfirmPin) => {
    setConfirmPin(enteredConfirmPin);
    setError('');

    if (enteredConfirmPin !== pin) {
      setError('PINs do not match');
      setTimeout(() => {
        setConfirmPin('');
      }, 1000);
      return;
    }

    // Submit PIN to backend
    setLoading(true);
    try {
      const token = localStorage.getItem('access');
      const response = await axios.post(
        `${API_BASE}/pin/setup/`,
        {
          pin: pin,
          pin_confirmation: enteredConfirmPin
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        setStep(3);
        toast.success('Transaction PIN set up successfully!');
        
        // Call onSuccess after a short delay
        setTimeout(() => {
          if (onSuccess) onSuccess();
          onClose();
          resetModal();
        }, 2000);
      }
    } catch (err) {
      const errorMsg =
        err.response?.data?.error ||
        err.response?.data?.pin?.[0] ||
        err.response?.data?.pin_confirmation?.[0] ||
        'Failed to set up PIN';
      setError(errorMsg);
      toast.error(errorMsg);
      
      // Reset to step 1 on error
      setTimeout(() => {
        setStep(1);
        setPin('');
        setConfirmPin('');
      }, 2000);
    } finally {
      setLoading(false);
    }
  };

  const resetModal = () => {
    setStep(1);
    setPin('');
    setConfirmPin('');
    setError('');
    setLoading(false);
  };

  const handleClose = () => {
    if (!loading) {
      resetModal();
      onClose();
    }
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      setConfirmPin('');
      setError('');
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
          w-full max-w-lg sm:max-w-xl
          rounded-t-2xl sm:rounded-2xl
          shadow-2xl
          max-h-[90vh]
          overflow-hidden
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <ShieldIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">
              Set Up Transaction PIN
            </h2>
          </div>
          {!loading && (
            <button
              onClick={handleClose}
              className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <XIcon className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto px-3 sm:px-4 py-4 space-y-4 sm:space-y-5 max-h-[60vh] sm:max-h-[65vh]">
          {step === 1 && (
            <div className="space-y-4 sm:space-y-5">

              {/* Instructions */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2 text-xs sm:text-sm">
                  📌 PIN Guidelines:
                </h3>
                <ul className="text-xs sm:text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                  <li>Must be exactly 4 digits</li>
                  <li>Avoid common patterns (1234, 0000, etc.)</li>
                  <li>Don't use your birthday or phone number</li>
                  <li>Keep it private and secure</li>
                </ul>
              </div>

              {/* PIN Input */}
              <div className="w-full max-w-sm mx-auto">
                <PINInput
                  title="Enter New PIN"
                  onComplete={handlePinComplete}
                  error={error}
                  loading={loading}
                  showKeypad={true}
                  autoFocus={true}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 sm:space-y-5">

              {/* Info */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <p className="text-xs sm:text-sm text-green-800 dark:text-green-300 font-medium">
                  ✓ PIN created. Please confirm to continue.
                </p>
              </div>

              {/* Confirm PIN Input */}
              <div className="w-full max-w-sm mx-auto">
                <PINInput
                  title="Confirm New PIN"
                  onComplete={handleConfirmPinComplete}
                  error={error}
                  loading={loading}
                  showKeypad={true}
                  autoFocus={true}
                />
              </div>

              {/* Back Button */}
              {!loading && (
                <button
                  onClick={handleBack}
                  className="w-full py-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium"
                >
                  ← Back to enter new PIN
                </button>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-6 sm:py-8 space-y-3 sm:space-y-4">
              <div className="bg-green-100 dark:bg-green-900/30 p-3 sm:p-4 rounded-full">
                <CheckCircleIcon className="w-12 h-12 sm:w-16 sm:h-16 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100">
                Success!
              </h3>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 text-center">
                Your transaction PIN has been set up successfully.
              </p>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 text-center">
                You can now use it to secure your transactions.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 3 && (
          <div className="px-3 sm:px-4 pb-3 sm:pb-4">
            <div className="flex items-start gap-2 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
              <AlertCircleIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 mt-0.5 flex-shrink-0" />
              <p>
                Your PIN is encrypted and securely stored. Never share it with anyone.
                MafitaPay will never ask for your PIN via email or phone.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PINSetupModal;
