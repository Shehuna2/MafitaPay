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
      const errorMsg = err.response?.data?.error || 
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-100 p-2 rounded-full">
              <ShieldIcon className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">
              Set Up Transaction PIN
            </h2>
          </div>
          {!loading && (
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <XIcon className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 && (
            <div className="space-y-6">
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">📌 PIN Guidelines:</h3>
                <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                  <li>Must be exactly 4 digits</li>
                  <li>Avoid common patterns (1234, 0000, etc.)</li>
                  <li>Don't use your birthday or phone number</li>
                  <li>Keep it private and secure</li>
                </ul>
              </div>

              {/* PIN Input */}
              <PINInput
                title="Enter New PIN"
                onComplete={handlePinComplete}
                error={error}
                loading={loading}
                showKeypad={true}
                autoFocus={true}
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              {/* Info */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800 font-medium">
                  ✓ PIN created. Please confirm to continue.
                </p>
              </div>

              {/* Confirm PIN Input */}
              <PINInput
                title="Confirm New PIN"
                onComplete={handleConfirmPinComplete}
                error={error}
                loading={loading}
                showKeypad={true}
                autoFocus={true}
              />

              {/* Back Button */}
              {!loading && (
                <button
                  onClick={handleBack}
                  className="w-full py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
                >
                  ← Back to enter new PIN
                </button>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="bg-green-100 p-4 rounded-full">
                <CheckCircleIcon className="w-16 h-16 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800">Success!</h3>
              <p className="text-gray-600 text-center">
                Your transaction PIN has been set up successfully.
              </p>
              <p className="text-sm text-gray-500 text-center">
                You can now use it to secure your transactions.
              </p>
            </div>
          )}
        </div>

        {/* Security Notice */}
        {step !== 3 && (
          <div className="px-6 pb-6">
            <div className="flex items-start space-x-2 text-xs text-gray-500">
              <AlertCircleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
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
