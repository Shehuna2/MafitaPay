// frontend/src/components/Biometric/BiometricEnrollmentModal.jsx
import React, { useState } from 'react';
import { 
  XIcon, 
  CheckCircleIcon, 
  AlertCircleIcon, 
  FingerprintIcon,
  SmartphoneIcon
} from 'lucide-react';
import useBiometricAuth from '../../hooks/useBiometricAuth';

/**
 * BiometricEnrollmentModal Component
 * Modal for enrolling biometric authentication
 */
const BiometricEnrollmentModal = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState(1); // 1: Info, 2: Enrolling, 3: Success
  const [error, setError] = useState('');
  const { enrollBiometric, checking } = useBiometricAuth();

  if (!isOpen) return null;

  const handleEnroll = async () => {
    setStep(2);
    setError('');

    const result = await enrollBiometric();

    if (result.success) {
      setStep(3);
      setTimeout(() => {
        if (onSuccess) onSuccess();
        handleClose();
      }, 2000);
    } else {
      setError(result.error || 'Failed to enroll biometric authentication');
      setStep(1);
    }
  };

  const handleClose = () => {
    if (!checking) {
      setStep(1);
      setError('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl max-w-lg w-full">
      

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-full">
              <FingerprintIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
              Biometric Authentication
            </h2>
          </div>
          {!checking && (
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <XIcon className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 && (
            <div className="space-y-6">

              {/* Info */}
              <div className="text-center space-y-4">
                <div className="bg-purple-50 dark:bg-purple-900/30 p-4 rounded-full w-24 h-24 mx-auto flex items-center justify-center">
                  <FingerprintIcon className="w-12 h-12 text-purple-600 dark:text-purple-400" />
                </div>
                
                <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                  Secure Your Transactions
                </h3>
                
                <p className="text-gray-600 dark:text-gray-300">
                  Use your fingerprint or face recognition to quickly and securely
                  authorize transactions without entering your PIN.
                </p>
              </div>

              {/* Features */}
              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Benefits:
                </h4>
                
                <div className="flex items-start space-x-3">
                  <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <strong>Fast & Convenient:</strong> No need to remember and type your PIN
                  </p>
                </div>
                
                <div className="flex items-start space-x-3">
                  <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <strong>Highly Secure:</strong> Your biometric data never leaves your device
                  </p>
                </div>
                
                <div className="flex items-start space-x-3">
                  <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <strong>PIN Fallback:</strong> You can always use your PIN if biometrics are unavailable
                  </p>
                </div>
              </div>

              {/* Device Requirements */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <SmartphoneIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-1">
                      Device Requirements:
                    </h4>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      Your device must support fingerprint or face recognition.
                      Make sure you've set up biometric authentication in your device settings.
                    </p>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <div className="flex items-start space-x-2">
                    <AlertCircleIcon className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-800 dark:text-red-300">
                      {error}
                    </p>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <button
                onClick={handleEnroll}
                className="w-full py-3 px-4 bg-purple-600 text-white font-semibold rounded-lg
                           hover:bg-purple-700 active:bg-purple-800 transition-colors
                           flex items-center justify-center space-x-2"
              >
                <FingerprintIcon className="w-5 h-5" />
                <span>Enroll Biometric Authentication</span>
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="relative">
                <div className="absolute inset-0 bg-purple-100 dark:bg-purple-900/40 rounded-full animate-ping"></div>
                <div className="relative bg-purple-50 dark:bg-purple-900/30 p-6 rounded-full">
                  <FingerprintIcon className="w-16 h-16 text-purple-600 dark:text-purple-400 animate-pulse" />
                </div>
              </div>
              
              <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                Setting Up...
              </h3>
              
              <p className="text-gray-600 dark:text-gray-300 text-center max-w-sm">
                Please follow the prompt on your device to complete biometric enrollment.
              </p>
              
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="bg-green-100 dark:bg-green-900/30 p-4 rounded-full">
                <CheckCircleIcon className="w-16 h-16 text-green-600 dark:text-green-400" />
              </div>
              
              <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                Enrollment Successful!
              </h3>
              
              <p className="text-gray-600 dark:text-gray-300 text-center max-w-sm">
                Biometric authentication is now enabled for your account.
                You can use it to quickly authorize transactions.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 1 && (
          <div className="px-6 pb-6">
            <div className="flex items-start space-x-2 text-xs text-gray-500 dark:text-gray-400">
              <AlertCircleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>
                Your biometric data is stored securely on your device and never sent to our servers.
                You can disable this feature at any time from your security settings.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BiometricEnrollmentModal;
