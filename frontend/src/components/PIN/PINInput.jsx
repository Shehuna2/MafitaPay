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
    <div className="flex flex-col items-center space-y-6 w-full max-w-md mx-auto">

      {/* Title */}
      <div className="flex items-center space-x-2">
        <LockIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          {title}
        </h3>
      </div>

      {/* PIN Boxes */}
      <div className="flex items-center space-x-3">
        {pin.map((digit, index) => (
          <input
            key={index}
            ref={inputRefs[index]}
            type={showPin ? 'text' : 'password'}
            pattern="\d*"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e. target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            disabled={loading}
            readOnly
            className={`
              w-14 h-14 text-center text-2xl font-bold rounded-lg border-2
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              transition-all duration-200
              ${
                digit
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                  : 'border-gray-300 bg-white dark:bg-gray-800 dark:border-gray-600'
              }
              ${
                error
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/30'
                  : ''
              }
              text-gray-900 dark:text-gray-100
              ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-text'}
            `}
          />
        ))}

        {/* Show / Hide */}
        <button
          type="button"
          onClick={() => setShowPin(!showPin)}
          className="ml-2 p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
        >
          {showPin ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600 dark: text-red-400 font-medium">
          {error}
        </p>
      )}

      {/* Keypad */}
      {showKeypad && (
        <div className="w-full">
          <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
            {[1,2,3,4,5,6,7,8,9]. map(num => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeypadClick(String(num))}
                disabled={loading}
                className={`
                  h-14 text-xl font-semibold rounded-lg border-2
                  bg-white text-gray-900 border-gray-300
                  dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600
                  hover:bg-blue-50 hover:border-blue-500
                  dark:hover:bg-gray-700 dark:hover:border-blue-400
                  active:bg-blue-100 dark:active:bg-gray-600
                  transition-all duration-150
                  ${loading ? 'opacity-50 cursor-not-allowed' :  'cursor-pointer'}
                `}
              >
                {num}
              </button>
            ))}

            {/* Clear */}
            <button
              type="button"
              onClick={handleClear}
              disabled={loading}
              className={`
                h-14 text-sm font-medium rounded-lg border-2
                bg-gray-100 text-gray-800 border-gray-300
                dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600
                hover:bg-gray-200 dark:hover:bg-gray-600
                active:bg-gray-300 dark:active:bg-gray-500
                transition-all duration-150
                ${loading ?  'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              Clear
            </button>

            {/* 0 */}
            <button
              type="button"
              onClick={() => handleKeypadClick('0')}
              disabled={loading || biometricLoading}
              className={`
                h-14 text-xl font-semibold rounded-lg border-2
                bg-white text-gray-900 border-gray-300
                dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600
                hover: bg-blue-50 hover: border-blue-500
                dark:hover:bg-gray-700 dark:hover:border-blue-400
                active:bg-blue-100 dark:active: bg-gray-600
                transition-all duration-150
                ${loading || biometricLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              0
            </button>

            {/* Biometric Button or Empty Space */}
            {showBiometric && onBiometricClick ? (
              <button
                type="button"
                onClick={onBiometricClick}
                disabled={loading || biometricLoading}
                className={`
                  h-14 rounded-lg border-2
                  bg-gradient-to-br from-purple-600 to-purple-700 text-white border-purple-500
                  dark:from-purple-700 dark:to-purple-800 dark:border-purple-600
                  hover:from-purple-500 hover:to-purple-600 hover:shadow-lg hover:shadow-purple-500/30
                  dark:hover:from-purple-600 dark:hover:to-purple-700
                  active:from-purple-700 active:to-purple-800
                  transition-all duration-150 transform hover:scale-105
                  flex items-center justify-center
                  ${loading || biometricLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  ${biometricLoading ? 'animate-pulse' : ''}
                `}
                aria-label="Use biometric authentication"
              >
                <FingerprintIcon className={`w-7 h-7 ${biometricLoading ? 'animate-spin' : ''}`} />
              </button>
            ) : (
              <div />
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <p className="text-xs text-gray-500 dark: text-gray-400 text-center max-w-xs">
        Your PIN is encrypted and never stored in plain text
      </p>
    </div>
  );
};

export default PINInput;