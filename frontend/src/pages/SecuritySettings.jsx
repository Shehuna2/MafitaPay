// frontend/src/pages/SecuritySettings.jsx
import React, { useState } from 'react';
import {
  ShieldCheck,
  LockKey,
  Fingerprint,
  CheckCircle,
  XCircle,
  X,
  Warning,
  GearSix,
} from '@phosphor-icons/react';
import { usePIN } from '../hooks/usePIN';
import useBiometricAuth from '../hooks/useBiometricAuth';
import PINSetupModal from '../components/PIN/PINSetupModal';
import PINInput from '../components/PIN/PINInput';
import BiometricEnrollmentModal from '../components/Biometric/BiometricEnrollmentModal';
import toast from 'react-hot-toast';

const SecuritySettings = () => {
  const { pinStatus, changePIN, refreshPINStatus } = usePIN();
  const {
    isSupported: biometricSupported,
    biometricStatus,
    disableBiometric,
    refreshBiometricStatus,
  } = useBiometricAuth();

  const [showPINSetup, setShowPINSetup] = useState(false);
  const [showChangePIN, setShowChangePIN] = useState(false);
  const [showBiometricEnroll, setShowBiometricEnroll] = useState(false);

  const [changePINStep, setChangePINStep] = useState(1);
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
    setTimeout(() => setChangePINStep(2), 250);
  };

  const handleNewPinComplete = (pin) => {
    if (pin === oldPin) {
      setChangePINError('New PIN must be different');
      return;
    }
    setNewPin(pin);
    setChangePINError('');
    setTimeout(() => setChangePINStep(3), 250);
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
      }, 1500);
    }
  };

  const handleDisableBiometric = async () => {
    if (window.confirm('Disable biometric authentication?')) {
      const result = await disableBiometric();
      if (result.success) refreshBiometricStatus();
    }
  };

  const handleBiometricEnrollSuccess = () => {
    refreshBiometricStatus();
    setShowBiometricEnroll(false);
  };

  return (
    <div
      className="
        min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-black text-white
        px-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]
      "
    >
      <div
        className="
          max-w-4xl mx-auto
          px-3 sm:px-6 lg:px-8
          pt-4 sm:pt-8
          pb-[calc(1rem+env(safe-area-inset-bottom))]
        "
      >
        {/* Header */}
        <div className="bg-gray-900/70 rounded-xl border border-gray-700/40 p-4 sm:p-6 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-600/20 border border-indigo-400/30">
              <ShieldCheck size={24} className="text-indigo-300 sm:hidden" />
              <ShieldCheck size={32} className="hidden sm:block text-indigo-300" />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold">
                Security Center
              </h1>
              <p className="text-xs sm:text-sm text-gray-400 mt-1">
                Manage your transaction security
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 sm:space-y-8">
          {/* PIN CARD */}
          <div className="bg-gray-900/60 rounded-xl border border-gray-700/40 p-4 sm:p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <LockKey size={20} className="text-emerald-300 sm:hidden" />
                <LockKey size={26} className="hidden sm:block text-emerald-300" />
                <div>
                  <h2 className="text-base sm:text-xl font-semibold">
                    Transaction PIN
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-400">
                    Secure 4-digit code
                  </p>
                </div>
              </div>

              {pinStatus.hasPin ? (
                <span className="flex items-center gap-1 text-emerald-400 text-xs sm:text-sm">
                  <CheckCircle size={14} /> Active
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-400 text-xs sm:text-sm">
                  <Warning size={14} /> Not set
                </span>
              )}
            </div>

            {pinStatus.lastChanged && (
              <p className="text-xs text-gray-400 mb-3">
                Last changed:{' '}
                <span className="text-gray-200">
                  {new Date(pinStatus.lastChanged).toLocaleDateString()}
                </span>
              </p>
            )}

            <button
              onClick={() =>
                pinStatus.hasPin
                  ? setShowChangePIN(true)
                  : setShowPINSetup(true)
              }
              disabled={pinStatus.isLocked || changePINLoading}
              className="
                w-full sm:w-auto
                px-4 sm:px-6 py-2.5
                text-sm sm:text-base
                rounded-lg
                bg-indigo-600 hover:bg-indigo-500
                disabled:opacity-50
                transition
              "
            >
              {pinStatus.hasPin ? 'Change PIN' : 'Set Up PIN'}
            </button>
          </div>

          {/* BIOMETRIC CARD */}
          <div className="bg-gray-900/60 rounded-xl border border-gray-700/40 p-4 sm:p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <Fingerprint size={20} className="text-purple-300 sm:hidden" />
                <Fingerprint size={26} className="hidden sm:block text-purple-300" />
                <div>
                  <h2 className="text-base sm:text-xl font-semibold">
                    Biometric Auth
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-400">
                    Fingerprint or Face ID
                  </p>
                </div>
              </div>

              {biometricStatus.enabled ? (
                <span className="flex items-center gap-1 text-emerald-400 text-xs sm:text-sm">
                  <CheckCircle size={14} /> Active
                </span>
              ) : (
                <span className="flex items-center gap-1 text-gray-400 text-xs sm:text-sm">
                  <XCircle size={14} /> Disabled
                </span>
              )}
            </div>

            <button
              onClick={
                biometricStatus.enabled
                  ? handleDisableBiometric
                  : () => setShowBiometricEnroll(true)
              }
              disabled={!biometricSupported}
              className="
                w-full sm:w-auto
                px-4 sm:px-6 py-2.5
                text-sm sm:text-base
                rounded-lg
                bg-purple-600 hover:bg-purple-500
                disabled:opacity-50
                transition
              "
            >
              {biometricStatus.enabled ? 'Disable Biometric' : 'Enable Biometric'}
            </button>
          </div>

          {/* SECURITY TIPS */}
          <div className="bg-indigo-950/40 rounded-xl border border-indigo-800/30 p-4 sm:p-6">
            <h3 className="flex items-center gap-2 text-sm sm:text-lg font-semibold text-indigo-300 mb-3">
              <GearSix size={18} /> Security Tips
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-gray-200">
              {[
                'Use both PIN and biometric',
                'Change PIN regularly',
                'Never share your PIN',
                'Avoid obvious patterns',
                'Keep your app updated',
              ].map((tip, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-1.5 h-1.5 mt-1.5 rounded-full bg-indigo-400" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
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

      {showChangePIN && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3">
          <div className="bg-gray-900 rounded-xl max-w-sm w-full border border-gray-700">
            <div className="flex justify-between items-center p-4 border-b border-gray-800">
              <h2 className="text-sm sm:text-base font-semibold">
                Change Transaction PIN
              </h2>
              <button onClick={() => setShowChangePIN(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="p-4">
              {changePINStep === 1 && (
                <PINInput title="Current PIN" onComplete={handleOldPinComplete} error={changePINError} />
              )}
              {changePINStep === 2 && (
                <PINInput title="New PIN" onComplete={handleNewPinComplete} error={changePINError} />
              )}
              {changePINStep === 3 && (
                <PINInput title="Confirm PIN" onComplete={handleConfirmPinComplete} error={changePINError} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecuritySettings;
