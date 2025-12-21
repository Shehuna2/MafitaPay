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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <div className="bg-purple-100 p-2 rounded-full">
              <FingerprintIcon className="w-6 h-6 text-purple-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">
              Biometric Authentication
            </h2>
          </div>
          {!checking && (
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
              {/* Info */}
              <div className="text-center space-y-4">
                <div className="bg-purple-50 p-4 rounded-full w-24 h-24 mx-auto flex items-center justify-center">
                  <FingerprintIcon className="w-12 h-12 text-purple-600" />
                </div>
                
                <h3 className="text-2xl font-bold text-gray-800">
                  Secure Your Transactions
                </h3>
                
                <p className="text-gray-600">
                  Use your fingerprint or face recognition to quickly and securely
                  authorize transactions without entering your PIN.
                </p>
              </div>

              {/* Features */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-gray-900 mb-2">Benefits:</h4>
                
                <div className="flex items-start space-x-3">
                  <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700">
                    <strong>Fast & Convenient:</strong> No need to remember and type your PIN
                  </p>
                </div>
                
                <div className="flex items-start space-x-3">
                  <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700">
                    <strong>Highly Secure:</strong> Your biometric data never leaves your device
                  </p>
                </div>
                
                <div className="flex items-start space-x-3">
                  <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700">
                    <strong>PIN Fallback:</strong> You can always use your PIN if biometrics are unavailable
                  </p>
                </div>
              </div>

              {/* Device Requirements */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <SmartphoneIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-blue-900 mb-1">Device Requirements:</h4>
                    <p className="text-sm text-blue-800">
                      Your device must support fingerprint or face recognition.
                      Make sure you've set up biometric authentication in your device settings.
                    </p>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start space-x-2">
                    <AlertCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-800">{error}</p>
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
                <div className="absolute inset-0 bg-purple-100 rounded-full animate-ping"></div>
                <div className="relative bg-purple-50 p-6 rounded-full">
                  <FingerprintIcon className="w-16 h-16 text-purple-600 animate-pulse" />
                </div>
              </div>
              
              <h3 className="text-2xl font-bold text-gray-800">
                Setting Up...
              </h3>
              
              <p className="text-gray-600 text-center max-w-sm">
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
              <div className="bg-green-100 p-4 rounded-full">
                <CheckCircleIcon className="w-16 h-16 text-green-600" />
              </div>
              
              <h3 className="text-2xl font-bold text-gray-800">
                Enrollment Successful!
              </h3>
              
              <p className="text-gray-600 text-center max-w-sm">
                Biometric authentication is now enabled for your account.
                You can use it to quickly authorize transactions.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 1 && (
          <div className="px-6 pb-6">
            <div className="flex items-start space-x-2 text-xs text-gray-500">
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
