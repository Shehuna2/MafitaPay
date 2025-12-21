// frontend/src/components/PIN/PINInput.jsx
import React, { useState, useRef, useEffect } from 'react';
import { LockIcon, EyeIcon, EyeOffIcon } from 'lucide-react';

/**
 * PINInput Component
 * A secure 4-digit PIN input component with numeric keypad
 * 
 * @param {Function} onComplete - Callback when PIN is fully entered
 * @param {String} title - Title to display above the PIN input
 * @param {Boolean} showKeypad - Whether to show numeric keypad (default: true)
 * @param {Boolean} autoFocus - Whether to auto-focus first input (default: true)
 */
const PINInput = ({ 
  onComplete, 
  title = "Enter PIN",
  showKeypad = true,
  autoFocus = true,
  error = null,
  loading = false
}) => {
  const [pin, setPin] = useState(['', '', '', '']);
  const [showPin, setShowPin] = useState(false);
  const inputRefs = [useRef(), useRef(), useRef(), useRef()];

  useEffect(() => {
    if (autoFocus && inputRefs[0].current) {
      inputRefs[0].current.focus();
    }
  }, [autoFocus]);

  const handleChange = (index, value) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);

    // Auto-focus next input
    if (value && index < 3) {
      inputRefs[index + 1].current?.focus();
    }

    // Call onComplete when all 4 digits are entered
    if (newPin.every(digit => digit !== '') && onComplete) {
      onComplete(newPin.join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    // Handle backspace
    if (e.key === 'Backspace') {
      if (!pin[index] && index > 0) {
        inputRefs[index - 1].current?.focus();
      }
    }
    // Handle left arrow
    else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
    // Handle right arrow
    else if (e.key === 'ArrowRight' && index < 3) {
      inputRefs[index + 1].current?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text');
    const digits = pastedData.replace(/\D/g, '').slice(0, 4).split('');
    
    const newPin = [...pin];
    digits.forEach((digit, i) => {
      if (i < 4) newPin[i] = digit;
    });
    setPin(newPin);

    // Focus the next empty input or last input
    const nextEmptyIndex = newPin.findIndex(d => d === '');
    const focusIndex = nextEmptyIndex >= 0 ? nextEmptyIndex : 3;
    inputRefs[focusIndex].current?.focus();

    // Call onComplete if all digits are filled
    if (newPin.every(digit => digit !== '') && onComplete) {
      onComplete(newPin.join(''));
    }
  };

  const handleKeypadClick = (digit) => {
    const firstEmptyIndex = pin.findIndex(d => d === '');
    if (firstEmptyIndex >= 0) {
      handleChange(firstEmptyIndex, digit);
    }
  };

  const handleClear = () => {
    setPin(['', '', '', '']);
    inputRefs[0].current?.focus();
  };

  return (
    <div className="flex flex-col items-center space-y-6 w-full max-w-md mx-auto">
      {/* Title */}
      <div className="flex items-center space-x-2">
        <LockIcon className="w-6 h-6 text-blue-600" />
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
      </div>

      {/* PIN Input Boxes */}
      <div className="flex items-center space-x-3">
        {pin.map((digit, index) => (
          <input
            key={index}
            ref={inputRefs[index]}
            type={showPin ? 'text' : 'password'}
            inputMode="numeric"
            pattern="\d*"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            disabled={loading}
            className={`
              w-14 h-14 text-center text-2xl font-bold border-2 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              transition-all duration-200
              ${digit ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'}
              ${error ? 'border-red-500 bg-red-50' : ''}
              ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-text'}
            `}
          />
        ))}
        
        {/* Show/Hide PIN Toggle */}
        <button
          type="button"
          onClick={() => setShowPin(!showPin)}
          className="ml-2 p-2 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
        >
          {showPin ? (
            <EyeOffIcon className="w-5 h-5" />
          ) : (
            <EyeIcon className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-sm text-red-600 font-medium">{error}</p>
      )}

      {/* Numeric Keypad */}
      {showKeypad && (
        <div className="w-full">
          <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeypadClick(String(num))}
                disabled={loading}
                className={`
                  h-14 text-xl font-semibold rounded-lg border-2 border-gray-300
                  hover:bg-blue-50 hover:border-blue-500 active:bg-blue-100
                  transition-all duration-150
                  ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {num}
              </button>
            ))}
            
            {/* Clear button */}
            <button
              type="button"
              onClick={handleClear}
              disabled={loading}
              className={`
                h-14 text-sm font-medium rounded-lg border-2 border-gray-300
                hover:bg-gray-100 hover:border-gray-400 active:bg-gray-200
                transition-all duration-150
                ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              Clear
            </button>
            
            {/* 0 button */}
            <button
              type="button"
              onClick={() => handleKeypadClick('0')}
              disabled={loading}
              className={`
                h-14 text-xl font-semibold rounded-lg border-2 border-gray-300
                hover:bg-blue-50 hover:border-blue-500 active:bg-blue-100
                transition-all duration-150
                ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              0
            </button>
            
            {/* Empty space for layout */}
            <div></div>
          </div>
        </div>
      )}

      {/* Security Info */}
      <p className="text-xs text-gray-500 text-center max-w-xs">
        Your PIN is encrypted and never stored in plain text
      </p>
    </div>
  );
};

export default PINInput;
