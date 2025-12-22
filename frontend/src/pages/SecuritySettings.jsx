// frontend/src/pages/SecuritySettings. jsx
import React, { useState } from 'react';
import { 
  ShieldIcon, 
  LockIcon, 
  FingerprintIcon,
  CheckCircleIcon,
  XCircleIcon,
  XIcon,
  AlertTriangleIcon,
  SettingsIcon
} from 'lucide-react';
import { usePIN } from '../hooks/usePIN';
import useBiometricAuth from '../hooks/useBiometricAuth';
import PINSetupModal from '../components/PIN/PINSetupModal';
import PINInput from '../components/PIN/PINInput';
import BiometricEnrollmentModal from '../components/Biometric/BiometricEnrollmentModal';
import toast from 'react-hot-toast';

/**
 * SecuritySettings Page
 * Comprehensive security settings for PIN and biometric authentication
 */
const SecuritySettings = () => {
  const { pinStatus, changePIN, refreshPINStatus } = usePIN();
  const { 
    isSupported:  biometricSupported, 
    biometricStatus, 
    disableBiometric, 
    refreshBiometricStatus 
  } = useBiometricAuth();

  const [showPINSetup, setShowPINSetup] = useState(false);
  const [showChangePIN, setShowChangePIN] = useState(false);
  const [showBiometricEnroll, setShowBiometricEnroll] = useState(false);
  
  // Change PIN state
  const [changePINStep, setChangePINStep] = useState(1); // 1: old, 2: new, 3: confirm
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [changePINError, setChangePINError] = useState('');
  const [changePINLoading, setChangePINLoading] = useState(false);

  const handlePINSetupSuccess = () => {
    refreshPINStatus();
    setShowPINSetup(false);
    toast.success('Transaction PIN set up successfully!');
  };

  const handleOldPinComplete = (pin) => {
    setOldPin(pin);
    setChangePINError('');
    setTimeout(() => setChangePINStep(2), 300);
  };

  const handleNewPinComplete = (pin) => {
    if (pin === oldPin) {
      setChangePINError('New PIN must be different from old PIN');
      return;
    }
    setNewPin(pin);
    setChangePINError('');
    setTimeout(() => setChangePINStep(3), 300);
  };

  const handleConfirmPinComplete = async (pin) => {
    if (pin !== newPin) {
      setChangePINError('PINs do not match');
      return;
    }

    setChangePINLoading(true);
    const result = await changePIN(oldPin, newPin, pin);
    setChangePINLoading(false);

    if (result.success) {
      setShowChangePIN(false);
      setChangePINStep(1);
      setOldPin('');
      setNewPin('');
      setChangePINError('');
      toast.success('Transaction PIN changed successfully!');
    } else {
      setChangePINError(result.error || 'Failed to change PIN');
      setTimeout(() => {
        setChangePINStep(1);
        setOldPin('');
        setNewPin('');
      }, 2000);
    }
  };

  const handleDisableBiometric = async () => {
    if (window.confirm('Are you sure you want to disable biometric authentication?')) {
      const result = await disableBiometric();
      if (result.success) {
        refreshBiometricStatus();
      }
    }
  };

  const handleBiometricEnrollSuccess = () => {
    refreshBiometricStatus();
    setShowBiometricEnroll(false);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg: px-8">
        {/* Header */}
        <div className="bg-gray-800/80 backdrop-blur-xl rounded-lg shadow-lg border border-gray-700/50 p-6 mb-6">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600/20 p-3 rounded-full border border-indigo-500/30">
              <ShieldIcon className="w-8 h-8 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Security Settings</h1>
              <p className="text-gray-400">Manage your transaction security preferences</p>
            </div>
          </div>
        </div>

        {/* Transaction PIN Section */}
        <div className="bg-gray-800/80 backdrop-blur-xl rounded-lg shadow-lg border border-gray-700/50 p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="bg-emerald-600/20 p-2 rounded-full border border-emerald-500/30">
                <LockIcon className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Transaction PIN</h2>
                <p className="text-sm text-gray-400">Secure your transactions with a 4-digit PIN</p>
              </div>
            </div>
            
            {pinStatus. loading ?  (
              <div className="animate-pulse bg-gray-700/50 h-8 w-24 rounded"></div>
            ) : pinStatus.hasPin ? (
              <div className="flex items-center space-x-2 text-emerald-400">
                <CheckCircleIcon className="w-5 h-5" />
                <span className="font-semibold">Enabled</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-amber-400">
                <AlertTriangleIcon className="w-5 h-5" />
                <span className="font-semibold">Not Set</span>
              </div>
            )}
          </div>

          {/* PIN Status */}
          <div className="space-y-4">
            {pinStatus.isLocked && (
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <XCircleIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-300">PIN Locked</p>
                    <p className="text-sm text-red-200">
                      Your PIN is temporarily locked due to too many failed attempts. Please try again later.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {pinStatus.lastChanged && (
              <div className="text-sm text-gray-400">
                Last changed: {new Date(pinStatus.lastChanged).toLocaleDateString()}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
              {! pinStatus.hasPin ? (
                <button
                  onClick={() => setShowPINSetup(true)}
                  className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg
                           hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
                >
                  Set Up PIN
                </button>
              ) : (
                <button
                  onClick={() => setShowChangePIN(true)}
                  disabled={pinStatus.isLocked}
                  className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg
                           hover:bg-indigo-700 active:bg-indigo-800 transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Change PIN
                </button>
              )}
            </div>

            {/* PIN Guidelines */}
            <div className="bg-gray-700/30 border border-gray-600/50 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-2">PIN Guidelines: </h3>
              <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
                <li>Must be exactly 4 digits</li>
                <li>Avoid common patterns like 1234 or 0000</li>
                <li>Don't use your birthday or phone number</li>
                <li>Never share your PIN with anyone</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Biometric Authentication Section */}
        <div className="bg-gray-800/80 backdrop-blur-xl rounded-lg shadow-lg border border-gray-700/50 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="bg-purple-600/20 p-2 rounded-full border border-purple-500/30">
                <FingerprintIcon className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Biometric Authentication</h2>
                <p className="text-sm text-gray-400">Use fingerprint or face recognition</p>
              </div>
            </div>
            
            {biometricStatus.loading ? (
              <div className="animate-pulse bg-gray-700/50 h-8 w-24 rounded"></div>
            ) : biometricStatus.enabled ? (
              <div className="flex items-center space-x-2 text-emerald-400">
                <CheckCircleIcon className="w-5 h-5" />
                <span className="font-semibold">Enabled</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-gray-500">
                <XCircleIcon className="w-5 h-5" />
                <span className="font-semibold">Disabled</span>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {/* Device Support Info */}
            {!biometricSupported && (
              <div className="bg-gray-900/20 border border-gray-500/30 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <AlertTriangleIcon className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-300">Not Supported</p>
                    <p className="text-sm text-amber-200">
                      Your device doesn't support biometric authentication or it's not enabled. 
                      Please set up fingerprint or face recognition in your device settings.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {biometricStatus.registered_at && (
              <div className="text-sm text-gray-400">
                Enrolled:  {new Date(biometricStatus.registered_at).toLocaleDateString()}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
              {!biometricStatus.enabled ?  (
                <button
                  onClick={() => setShowBiometricEnroll(true)}
                  disabled={! biometricSupported}
                  className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg
                           hover:bg-purple-700 active:bg-purple-800 transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Enable Biometric
                </button>
              ) : (
                <button
                  onClick={handleDisableBiometric}
                  className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg
                           hover:bg-red-700 active:bg-red-800 transition-colors"
                >
                  Disable Biometric
                </button>
              )}
            </div>

            {/* Biometric Info */}
            <div className="bg-gray-700/30 border border-gray-600/50 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-2">About Biometric Authentication:</h3>
              <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
                <li>Quick and convenient transaction approval</li>
                <li>Your biometric data never leaves your device</li>
                <li>You can always use your PIN as a fallback</li>
                <li>Requires fingerprint or face recognition to be set up on your device</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Security Tips */}
        <div className="mt-6 bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-6">
          <h3 className="font-semibold text-indigo-300 mb-3 flex items-center space-x-2">
            <SettingsIcon className="w-5 h-5" />
            <span>Security Best Practices</span>
          </h3>
          <ul className="text-sm text-indigo-200 space-y-2 list-disc list-inside">
            <li>Enable both PIN and biometric authentication for maximum security</li>
            <li>Change your PIN regularly</li>
            <li>Never share your PIN with anyone, including MafitaPay staff</li>
            <li>Use a PIN that's not related to your personal information</li>
            <li>Keep your device's operating system and apps up to date</li>
          </ul>
        </div>
      </div>

      {/* Modals */}
      <PINSetupModal
        isOpen={showPINSetup}
        onClose={() => setShowPINSetup(false)}
        onSuccess={handlePINSetupSuccess}
      />

      <BiometricEnrollmentModal
        isOpen={showBiometricEnroll}
        onClose={() => setShowBiometricEnroll(false)}
        onSuccess={handleBiometricEnrollSuccess}
      />

      {/* Change PIN Modal */}
      {showChangePIN && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-800/95 backdrop-blur-xl rounded-lg shadow-2xl max-w-lg w-full border border-gray-700/50">
            <div className="flex items-center justify-between p-6 border-b border-gray-700/50">
              <h2 className="text-xl font-bold text-white">Change Transaction PIN</h2>
              <button
                onClick={() => {
                  setShowChangePIN(false);
                  setChangePINStep(1);
                  setOldPin('');
                  setNewPin('');
                  setChangePINError('');
                }}
                disabled={changePINLoading}
                className="text-gray-400 hover:text-gray-200 transition-colors"
              >
                <XIcon className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              {changePINStep === 1 && (
                <PINInput
                  title="Enter Current PIN"
                  onComplete={handleOldPinComplete}
                  error={changePINError}
                  loading={changePINLoading}
                />
              )}
              {changePINStep === 2 && (
                <PINInput
                  title="Enter New PIN"
                  onComplete={handleNewPinComplete}
                  error={changePINError}
                  loading={changePINLoading}
                />
              )}
              {changePINStep === 3 && (
                <PINInput
                  title="Confirm New PIN"
                  onComplete={handleConfirmPinComplete}
                  error={changePINError}
                  loading={changePINLoading}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecuritySettings;