# Mobile Optimization Hooks - Usage Guide

This document provides examples of how to use the mobile optimization hooks in the MafitaPay application.

## Overview

The `useMobileOptimizations.js` file provides 7 comprehensive hooks for mobile optimization:

1. **useMobileOptimizations** - Platform detection and device state
2. **useHapticFeedback** - Vibration feedback
3. **useSafeArea** - Safe area insets for notch devices
4. **useViewportConstraints** - Viewport height management
5. **useTouchDetection** - Touch capability detection
6. **useDisablePinchZoom** - Prevent zoom gestures
7. **useFullscreenLayout** - Modal scroll management

## Installation

The hooks are already available in the project at:
```
frontend/src/hooks/useMobileOptimizations.js
```

## Usage Examples

### 1. useMobileOptimizations

Detect platform type, screen size, orientation, and keyboard state:

```javascript
import { useMobileOptimizations } from './hooks/useMobileOptimizations';

function MyComponent() {
  const {
    isNative,           // true on iOS/Android apps
    platform,           // 'ios', 'android', or 'web'
    screenSize,         // { width: number, height: number }
    orientation,        // 'portrait' or 'landscape'
    keyboardHeight,     // keyboard height in pixels
    isKeyboardVisible   // true when keyboard is shown
  } = useMobileOptimizations();

  return (
    <div>
      {isNative && <p>Running in native app on {platform}</p>}
      <p>Screen: {screenSize.width}x{screenSize.height}</p>
      <p>Orientation: {orientation}</p>
      {isKeyboardVisible && (
        <div style={{ marginBottom: `${keyboardHeight}px` }}>
          Content adjusted for keyboard
        </div>
      )}
    </div>
  );
}
```

### 2. useHapticFeedback

Add tactile feedback for user interactions:

```javascript
import { useHapticFeedback } from './hooks/useMobileOptimizations';

function MyButton() {
  const triggerHaptic = useHapticFeedback();

  const handleClick = () => {
    triggerHaptic('medium'); // Options: 'light', 'medium', 'heavy', 'success', 'warning', 'error'
    // ... your button logic
  };

  return (
    <button onClick={handleClick}>
      Click me (with haptic feedback)
    </button>
  );
}
```

### 3. useSafeArea

Handle safe areas on devices with notches:

```javascript
import { useSafeArea } from './hooks/useMobileOptimizations';

function MyHeader() {
  const safeArea = useSafeArea(); // { top, right, bottom, left }

  return (
    <header style={{
      paddingTop: `${safeArea.top}px`,
      paddingLeft: `${safeArea.left}px`,
      paddingRight: `${safeArea.right}px`,
    }}>
      Header content (respects notch)
    </header>
  );
}
```

### 4. useViewportConstraints

Prevent layout shift when mobile browser chrome appears/disappears:

```javascript
import { useViewportConstraints } from './hooks/useMobileOptimizations';

function MyFullHeightPage() {
  const { height, visualHeight } = useViewportConstraints();

  return (
    <div style={{
      minHeight: `${height}px`, // Fixed height ignoring browser UI
      // or use visualHeight for current visible viewport
    }}>
      Full height content
    </div>
  );
}
```

### 5. useTouchDetection

Conditionally render UI based on touch support:

```javascript
import { useTouchDetection } from './hooks/useMobileOptimizations';

function MyInteractiveElement() {
  const isTouchDevice = useTouchDetection();

  return (
    <div>
      {isTouchDevice ? (
        <button>Tap here</button>
      ) : (
        <button>Click here</button>
      )}
    </div>
  );
}
```

### 6. useDisablePinchZoom

Prevent accidental zoom on mobile:

```javascript
import { useDisablePinchZoom } from './hooks/useMobileOptimizations';

function MyForm() {
  // Disable pinch zoom on this component
  useDisablePinchZoom(true);

  return (
    <form>
      <input type="text" placeholder="No zoom on focus" />
    </form>
  );
}
```

### 7. useFullscreenLayout

Manage fullscreen modals with proper scroll locking:

```javascript
import { useFullscreenLayout } from './hooks/useMobileOptimizations';
import { useState } from 'react';

function MyModal() {
  const [isOpen, setIsOpen] = useState(false);
  const { lockScroll, unlockScroll } = useFullscreenLayout(isOpen);

  // Can also manually control scroll
  const openModal = () => {
    setIsOpen(true);
    // lockScroll(); // Auto-called when isOpen=true
  };

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open Modal</button>
      
      {isOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Modal Content</h2>
            <p>Background scroll is locked</p>
            <button onClick={() => setIsOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
```

## Combined Usage Example

Real-world example combining multiple hooks:

```javascript
import {
  useMobileOptimizations,
  useHapticFeedback,
  useSafeArea,
  useDisablePinchZoom
} from './hooks/useMobileOptimizations';

function PaymentForm() {
  const { isNative, platform, isKeyboardVisible, keyboardHeight } = useMobileOptimizations();
  const triggerHaptic = useHapticFeedback();
  const safeArea = useSafeArea();
  useDisablePinchZoom(true);

  const handleSubmit = (e) => {
    e.preventDefault();
    triggerHaptic('success');
    // Process payment...
  };

  return (
    <div 
      style={{
        paddingTop: `${safeArea.top}px`,
        paddingBottom: isKeyboardVisible 
          ? `${keyboardHeight}px` 
          : `${safeArea.bottom}px`,
      }}
    >
      <form onSubmit={handleSubmit}>
        {isNative && (
          <div className="native-badge">
            Running on {platform}
          </div>
        )}
        
        <input type="text" placeholder="Amount" />
        <button type="submit">Pay Now</button>
      </form>
    </div>
  );
}
```

## Best Practices

1. **Platform Detection**: Use `isNative` to conditionally render native-specific UI
2. **Haptic Feedback**: Apply to important actions (buttons, success states, errors)
3. **Safe Area**: Always apply to fixed headers/footers and fullscreen components
4. **Viewport Constraints**: Use for full-height layouts and to prevent UI jump
5. **Touch Detection**: Adjust UI spacing and interaction patterns for touch
6. **Pinch Zoom**: Disable on forms and interactive components where zoom interferes
7. **Fullscreen Layout**: Use for modals, overlays, and bottom sheets

## Capacitor Integration

These hooks integrate seamlessly with Capacitor:

- **Platform Detection**: Uses `Capacitor.isNativePlatform()` and `Capacitor.getPlatform()`
- **Keyboard Events**: Listens to Capacitor keyboard events (keyboardWillShow, keyboardDidShow, etc.)
- **Safe Area**: Uses CSS environment variables set by Capacitor

## Browser Compatibility

- All hooks work in modern browsers (Chrome, Safari, Firefox, Edge)
- Haptic feedback uses the Vibration API (supported in most browsers, limited in iOS Safari)
- Safe area uses CSS env() variables (iOS 11.2+, Android with notch support)
- Visual Viewport API used for viewport constraints (modern browsers)

## Performance Considerations

- Hooks use debouncing for resize/scroll events to minimize re-renders
- State updates are optimized with `useCallback` and `useRef`
- Event listeners are properly cleaned up on unmount
- Minimal re-renders through careful dependency management

## Troubleshooting

### Keyboard height not detected
- Ensure running on native platform with Capacitor
- Check that Keyboard plugin is installed: `@capacitor/keyboard`

### Safe area insets are 0
- Check device has notch/safe areas
- Verify viewport meta tag includes `viewport-fit=cover`
- Ensure running on iOS 11.2+ or Android with display cutout

### Haptic feedback not working
- Vibration API not supported in iOS Safari
- Check device has vibration motor
- Verify browser permissions

## Further Resources

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Visual Viewport API](https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API)
- [CSS env() Variables](https://developer.mozilla.org/en-US/docs/Web/CSS/env)
- [Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API)
