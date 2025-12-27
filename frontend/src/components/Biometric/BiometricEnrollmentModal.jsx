// frontend/src/components/Biometric/BiometricEnrollmentModal.jsx
import React, { useState } from 'react';
import {
  XIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  FingerprintIcon,
  SmartphoneIcon,
} from 'lucide-react';
import useBiometricAuth from '../../hooks/useBiometricAuth';

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
        onSuccess?.();
        handleClose();
      }, 1800);
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
            <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <FingerprintIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">
              Biometric Authentication
            </h2>
          </div>

          {!checking && (
            <button
              onClick={handleClose}
              className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <XIcon className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto px-4 py-4 space-y-5">
          {/* STEP 1 */}
          {step === 1 && (
            <>
              <div className="text-center space-y-3">
                <div className="mx-auto w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                  <FingerprintIcon className="w-8 h-8 text-purple-600 dark:text-indigo-400" />
                </div>

                <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Secure Your Transactions
                </h3>

                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                  Use fingerprint or face recognition to approve transactions
                  faster and more securely.
                </p>
              </div>

              {/* Benefits */}
              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
                {[
                  'Fast & convenient access',
                  'Biometric data stays on your device',
                  'PIN always available as backup',
                ].map((text, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircleIcon className="w-4 h-4 text-green-500 mt-0.5" />
                    <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                      {text}
                    </p>
                  </div>
                ))}
              </div>

              {/* Device Requirement */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <div className="flex gap-2">
                  <SmartphoneIcon className="w-4 h-4 text-blue-600 mt-0.5" />
                  <p className="text-xs sm:text-sm text-blue-800 dark:text-blue-200">
                    Your device must support fingerprint or face authentication
                    and have it enabled in system settings.
                  </p>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <div className="flex gap-2">
                    <AlertCircleIcon className="w-4 h-4 text-red-600 mt-0.5" />
                    <p className="text-xs sm:text-sm text-red-700 dark:text-red-300">
                      {error}
                    </p>
                  </div>
                </div>
              )}

              {/* Action */}
              <button
                onClick={handleEnroll}
                className="
                  w-full
                  py-2.5
                  text-sm sm:text-base
                  rounded-lg
                  bg-purple-600 hover:bg-purple-500
                  text-white font-medium
                  flex items-center justify-center gap-2
                  transition
                "
              >
                <FingerprintIcon className="w-4 h-4" />
                Enable Biometric
              </button>
            </>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="flex flex-col items-center text-center py-6 space-y-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-indigo-300/30 animate-ping" />
                <div className="relative p-4 rounded-full bg-indigo-100 dark:bg-purple-900/30">
                  <FingerprintIcon className="w-10 h-10 text-indigo-600 animate-pulse" />
                </div>
              </div>

              <h3 className="text-base sm:text-lg font-semibold">
                Setting up…
              </h3>

              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 max-w-xs">
                Follow the prompt on your device to complete biometric enrollment.
              </p>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="flex flex-col items-center text-center py-6 space-y-4">
              <div className="p-4 rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircleIcon className="w-10 h-10 text-green-600" />
              </div>

              <h3 className="text-base sm:text-lg font-semibold">
                Enrollment Successful
              </h3>

              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 max-w-xs">
                Biometric authentication is now active for your account.
              </p>
            </div>
          )}
        </div>

        {/* Footer note */}
        {step === 1 && (
          <div className="px-4 pb-4">
            <div className="flex gap-2 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
              <AlertCircleIcon className="w-4 h-4 mt-0.5" />
              <p>
                Your biometric data never leaves your device and can be disabled
                anytime from security settings.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BiometricEnrollmentModal;
