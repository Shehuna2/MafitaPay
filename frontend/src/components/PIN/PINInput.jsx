import React, { useState, useRef, useEffect } from 'react';
import { LockIcon, EyeIcon, EyeOffIcon, FingerprintIcon } from 'lucide-react';

/**
 * PINInput Component
 * A secure 4-digit PIN input component with numeric keypad
 */
const PINInput = ({ 
  onComplete, 
  title = "Enter PIN",
  showKeypad = true,
  autoFocus = true,
  error = null,
  loading = false,
  showBiometric = false,
  onBiometricClick = null,
  biometricLoading = false
}) => {
  const [pin, setPin] = useState(['', '', '', '']);
  const [showPin, setShowPin] = useState(false);
  const inputRefs = [useRef(), useRef(), useRef(), useRef()];

  useEffect(() => {
    if (autoFocus && inputRefs[0]. current) {
      inputRefs[0].current.focus();
    }
  }, [autoFocus]);

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);

    if (value && index < 3) {
      inputRefs[index + 1]. current?. focus();
    }

    if (newPin. every(d => d !== '') && onComplete) {
      onComplete(newPin. join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    // Only allow numeric input and navigation keys
    if (!/^\d$/.test(e.key) && 
        ! ['Backspace', 'ArrowLeft', 'ArrowRight', 'Tab']. includes(e.key)) {
      e.preventDefault();
      return;
    }

    if (e.key === 'Backspace') {
      const newPin = [...pin];
      newPin[index] = '';
      setPin(newPin);
      if (index > 0) {
        inputRefs[index - 1].current?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs[index - 1]. current?.focus();
    } else if (e.key === 'ArrowRight' && index < 3) {
      inputRefs[index + 1].current?. focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const digits = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, 4)
      .split('');

    const newPin = [...pin];
    digits.forEach((d, i) => {
      if (i < 4) newPin[i] = d;
    });

    setPin(newPin);

    const nextEmpty = newPin.findIndex(d => d === '');
    inputRefs[(nextEmpty >= 0 ? nextEmpty :  3)]?.current?.focus();

    if (newPin.every(d => d !== '') && onComplete) {
      onComplete(newPin.join(''));
    }
  };

  const handleKeypadClick = (digit) => {
    const index = pin.findIndex(d => d === '');
    if (index >= 0) handleChange(index, digit);
  };

  const handleClear = () => {
    setPin(['', '', '', '']);
    inputRefs[0].current?.focus();
  };

  return (
    <div className="flex flex-col items-center space-y-4 w-full max-w-md mx-auto">

      {/* Premium Title */}
      <div className="flex items-center space-x-2">
        <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30">
          <LockIcon className="w-4 h-4 text-white" />
        </div>
        <h3 className="text-sm font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
          {title}
        </h3>
      </div>

      {/* Premium PIN Boxes */}
      <div className="flex items-center space-x-2.5">
        {pin.map((digit, index) => (
          <input
            key={index}
            ref={inputRefs[index]}
            type={showPin ? 'text' : 'password'}
            pattern="\d*"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            disabled={loading}
            readOnly
            className={`
              w-12 h-12 text-center text-xl font-bold rounded-xl border-2
              focus:outline-none transition-all duration-300
              ${
                digit
                  ? 'border-indigo-500 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 shadow-lg shadow-indigo-500/20 scale-105'
                  : 'border-gray-700 bg-gray-800/50'
              }
              ${
                error
                  ? 'border-red-500 bg-gradient-to-br from-red-500/10 to-orange-500/10 shadow-lg shadow-red-500/20'
                  : ''
              }
              text-white placeholder-gray-500
              ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-text hover:border-indigo-400'}
            `}
          />
        ))}

        {/* Show / Hide Button - Premium */}
        <button
          type="button"
          onClick={() => setShowPin(!showPin)}
          className="ml-1 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/50 transition-all duration-200 active:scale-95"
          aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
        >
          {showPin ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
        </button>
      </div>

      {/* Error Message - Premium */}
      {error && (
        <p className="text-xs font-medium bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent animate-pulse">
          {error}
        </p>
      )}

      {/* Premium Keypad */}
      {showKeypad && (
        <div className="w-full">
          <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
            {[1,2,3,4,5,6,7,8,9].map(num => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeypadClick(String(num))}
                disabled={loading}
                className={`
                  h-12 text-lg font-bold rounded-xl border
                  bg-gradient-to-br from-gray-800 to-gray-900 text-white border-gray-700
                  hover:from-indigo-600/20 hover:to-purple-600/20 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/20
                  active:scale-95 active:from-indigo-600/30 active:to-purple-600/30
                  transition-all duration-200
                  ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {num}
              </button>
            ))}

            {/* Clear Button - Premium */}
            <button
              type="button"
              onClick={handleClear}
              disabled={loading}
              className={`
                h-12 text-xs font-semibold rounded-xl border
                bg-gradient-to-br from-gray-700 to-gray-800 text-gray-300 border-gray-600
                hover:from-gray-600 hover:to-gray-700 hover:text-white hover:border-gray-500
                active:scale-95
                transition-all duration-200
                ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              Clear
            </button>

            {/* 0 Button - Premium */}
            <button
              type="button"
              onClick={() => handleKeypadClick('0')}
              disabled={loading || biometricLoading}
              className={`
                h-12 text-lg font-bold rounded-xl border
                bg-gradient-to-br from-gray-800 to-gray-900 text-white border-gray-700
                hover:from-indigo-600/20 hover:to-purple-600/20 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/20
                active:scale-95 active:from-indigo-600/30 active:to-purple-600/30
                transition-all duration-200
                ${loading || biometricLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              0
            </button>

            {/* Premium Biometric Button - More Prominent */}
            {showBiometric && onBiometricClick ? (
              <button
                type="button"
                onClick={onBiometricClick}
                disabled={loading || biometricLoading}
                className={`
                  h-12 rounded-xl border-2 relative overflow-hidden
                  bg-gradient-to-br from-purple-600 via-pink-600 to-indigo-600 text-white border-purple-500
                  hover:from-purple-500 hover:via-pink-500 hover:to-indigo-500 hover:shadow-2xl hover:shadow-purple-500/50 hover:scale-105
                  active:scale-95
                  transition-all duration-300 transform
                  flex items-center justify-center
                  ${loading || biometricLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  ${biometricLoading ? 'animate-pulse' : ''}
                `}
                aria-label="Use biometric authentication"
              >
                {/* Animated gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                <FingerprintIcon className={`w-6 h-6 relative z-10 ${biometricLoading ? 'animate-spin' : 'animate-pulse'}`} />
              </button>
            ) : (
              <div />
            )}
          </div>
        </div>
      )}

      {/* Premium Footer */}
      <p className="text-[10px] text-gray-500 text-center max-w-xs">
        🔒 Your PIN is encrypted and never stored in plain text
      </p>
    </div>
  );
};

export default PINInput;