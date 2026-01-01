// hooks/useMobileOptimizations.js
import { useState, useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Main hook to detect platform (native/web), screen size, orientation, keyboard height, and platform type (iOS/Android)
 * 
 * @returns {Object} Mobile optimization state and utilities
 * - isNative: boolean - Whether running on native platform
 * - platform: string - Platform type (ios, android, web)
 * - screenSize: Object - Screen dimensions {width, height}
 * - orientation: string - Current orientation (portrait, landscape)
 * - keyboardHeight: number - Current keyboard height in pixels
 * - isKeyboardVisible: boolean - Whether keyboard is currently visible
 */
export function useMobileOptimizations() {
  const [isNative] = useState(() => Capacitor.isNativePlatform());
  const [platform] = useState(() => Capacitor.getPlatform());
  const [screenSize, setScreenSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [orientation, setOrientation] = useState(() => 
    window.innerWidth > window.innerHeight ? "landscape" : "portrait"
  );
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Handle screen resize
  useEffect(() => {
    const handleResize = () => {
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
      setOrientation(
        window.innerWidth > window.innerHeight ? "landscape" : "portrait"
      );
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Handle keyboard visibility (primarily for Capacitor)
  useEffect(() => {
    const handleKeyboardShow = (event) => {
      const height = event.detail?.keyboardHeight || 0;
      setKeyboardHeight(height);
      setIsKeyboardVisible(true);
    };

    const handleKeyboardHide = () => {
      setKeyboardHeight(0);
      setIsKeyboardVisible(false);
    };

    // Capacitor keyboard events
    window.addEventListener("keyboardWillShow", handleKeyboardShow);
    window.addEventListener("keyboardDidShow", handleKeyboardShow);
    window.addEventListener("keyboardWillHide", handleKeyboardHide);
    window.addEventListener("keyboardDidHide", handleKeyboardHide);

    return () => {
      window.removeEventListener("keyboardWillShow", handleKeyboardShow);
      window.removeEventListener("keyboardDidShow", handleKeyboardShow);
      window.removeEventListener("keyboardWillHide", handleKeyboardHide);
      window.removeEventListener("keyboardDidHide", handleKeyboardHide);
    };
  }, []);

  return {
    isNative,
    platform,
    screenSize,
    orientation,
    keyboardHeight,
    isKeyboardVisible,
  };
}

/**
 * Hook to trigger device vibration feedback
 * Provides haptic feedback on supported devices
 * 
 * @returns {Function} triggerHaptic - Function to trigger haptic feedback
 */
export function useHapticFeedback() {
  const triggerHaptic = useCallback((style = "medium") => {
    try {
      // For native platforms, we could use Capacitor Haptics plugin
      // For now, use the standard Vibration API available in web
      if (navigator.vibrate) {
        const patterns = {
          light: 10,
          medium: 20,
          heavy: 30,
          success: [10, 50, 10],
          warning: [20, 100, 20],
          error: [30, 100, 30, 100, 30],
        };
        
        const pattern = patterns[style] || patterns.medium;
        navigator.vibrate(pattern);
      }
    } catch (error) {
      console.warn("Haptic feedback not supported:", error);
    }
  }, []);

  return triggerHaptic;
}

/**
 * Hook to get safe area insets for notch devices
 * Returns insets for devices with notches, rounded corners, etc.
 * 
 * @returns {Object} Safe area insets {top, right, bottom, left}
 */
export function useSafeArea() {
  const [safeArea, setSafeArea] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  useEffect(() => {
    const updateSafeArea = () => {
      // Get CSS custom properties that should be set from env() values in CSS
      // Note: env() values must be set in CSS as custom properties first
      const computedStyle = getComputedStyle(document.documentElement);
      
      const top = parseInt(
        computedStyle.getPropertyValue("--safe-area-inset-top") || "0",
        10
      );
      
      const right = parseInt(
        computedStyle.getPropertyValue("--safe-area-inset-right") || "0",
        10
      );
      
      const bottom = parseInt(
        computedStyle.getPropertyValue("--safe-area-inset-bottom") || "0",
        10
      );
      
      const left = parseInt(
        computedStyle.getPropertyValue("--safe-area-inset-left") || "0",
        10
      );

      setSafeArea({ top, right, bottom, left });
    };

    updateSafeArea();
    
    // Update on resize or orientation change
    window.addEventListener("resize", updateSafeArea);
    window.addEventListener("orientationchange", updateSafeArea);

    return () => {
      window.removeEventListener("resize", updateSafeArea);
      window.removeEventListener("orientationchange", updateSafeArea);
    };
  }, []);

  return safeArea;
}

/**
 * Hook to manage viewport height and prevent layout shift
 * Prevents issues with mobile browser chrome/UI affecting viewport height
 * 
 * @returns {Object} Viewport constraints {height, visualHeight}
 * - height: Fixed viewport height (ignores browser UI)
 * - visualHeight: Current visual viewport height
 */
export function useViewportConstraints() {
  const [viewportHeight, setViewportHeight] = useState({
    height: window.innerHeight,
    visualHeight: window.visualViewport?.height || window.innerHeight,
  });

  useEffect(() => {
    let resizeTimer;

    const handleResize = () => {
      // Use visual viewport if available (better for mobile)
      const visualHeight = window.visualViewport?.height || window.innerHeight;
      const height = window.innerHeight;

      setViewportHeight({ height, visualHeight });
    };

    const handleVisualViewportResize = () => {
      // Debounce to avoid too many updates
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        handleResize();
      }, 100);
    };

    // Listen to both window and visual viewport resize
    window.addEventListener("resize", handleResize);
    
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleVisualViewportResize);
      window.visualViewport.addEventListener("scroll", handleVisualViewportResize);
    }

    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
      
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleVisualViewportResize);
        window.visualViewport.removeEventListener("scroll", handleVisualViewportResize);
      }
    };
  }, []);

  return viewportHeight;
}

/**
 * Hook to detect if device supports touch
 * Useful for conditional UI rendering
 * 
 * @returns {boolean} isTouchDevice - Whether device supports touch
 */
export function useTouchDetection() {
  const [isTouchDevice] = useState(() => {
    // Check multiple indicators of touch support
    return (
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0
    );
  });

  return isTouchDevice;
}

/**
 * Hook to disable pinch-to-zoom on mobile
 * Prevents accidental zoom gestures that can disrupt the UI
 * 
 * @param {boolean} disabled - Whether to disable pinch zoom (default: true)
 */
export function useDisablePinchZoom(disabled = true) {
  const lastTouchRef = useRef(0);
  const viewportMetaRef = useRef(null);
  const originalContentRef = useRef(null);
  const wasCreatedRef = useRef(false);

  useEffect(() => {
    if (!disabled) return;

    const preventZoom = (e) => {
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
    };

    const preventDoubleTapZoom = (e) => {
      const now = Date.now();
      const timeSinceLastTouch = now - lastTouchRef.current;
      
      if (timeSinceLastTouch < 300 && timeSinceLastTouch > 0) {
        e.preventDefault();
      }
      
      lastTouchRef.current = now;
    };

    const preventGestureZoom = (e) => {
      e.preventDefault();
    };

    // Only modify viewport meta tag on first mount to avoid conflicts
    if (!viewportMetaRef.current) {
      let viewportMeta = document.querySelector('meta[name="viewport"]');
      
      if (viewportMeta) {
        viewportMetaRef.current = viewportMeta;
        originalContentRef.current = viewportMeta.getAttribute("content");
        wasCreatedRef.current = false;
        viewportMeta.setAttribute(
          "content",
          "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        );
      } else {
        viewportMeta = document.createElement("meta");
        viewportMeta.name = "viewport";
        viewportMeta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
        document.head.appendChild(viewportMeta);
        viewportMetaRef.current = viewportMeta;
        wasCreatedRef.current = true;
      }
    }

    // Prevent pinch zoom via touch events
    document.addEventListener("touchstart", preventZoom, { passive: false });
    document.addEventListener("touchmove", preventZoom, { passive: false });
    document.addEventListener("touchend", preventDoubleTapZoom, { passive: false });

    // Prevent zoom via gesture events (Safari)
    document.addEventListener("gesturestart", preventGestureZoom);

    return () => {
      document.removeEventListener("touchstart", preventZoom);
      document.removeEventListener("touchmove", preventZoom);
      document.removeEventListener("touchend", preventDoubleTapZoom);
      document.removeEventListener("gesturestart", preventGestureZoom);
      
      // Restore or remove viewport meta tag on cleanup
      const viewportMeta = viewportMetaRef.current;
      if (viewportMeta) {
        if (wasCreatedRef.current) {
          // Remove the tag we created
          viewportMeta.remove();
        } else if (originalContentRef.current) {
          // Restore the original content
          viewportMeta.setAttribute("content", originalContentRef.current);
        }
        viewportMetaRef.current = null;
        originalContentRef.current = null;
        wasCreatedRef.current = false;
      }
    };
  }, [disabled]);
}

/**
 * Hook to manage full-screen modal layouts
 * Handles body scroll locking and proper mobile modal display
 * 
 * @param {boolean} isOpen - Whether the fullscreen modal is open
 * @returns {Object} Modal utilities
 * - lockScroll: Function to manually lock scroll
 * - unlockScroll: Function to manually unlock scroll
 */
export function useFullscreenLayout(isOpen = false) {
  const scrollPositionRef = useRef(0);

  const lockScroll = useCallback(() => {
    // Save current scroll position
    scrollPositionRef.current = window.scrollY;
    
    // Lock body scroll
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollPositionRef.current}px`;
    document.body.style.width = "100%";
  }, []);

  const unlockScroll = useCallback(() => {
    // Restore body scroll
    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    
    // Restore scroll position
    window.scrollTo(0, scrollPositionRef.current);
  }, []);

  useEffect(() => {
    if (isOpen) {
      lockScroll();
    } else {
      unlockScroll();
    }

    // Cleanup on unmount
    return () => {
      unlockScroll();
    };
  }, [isOpen, lockScroll, unlockScroll]);

  return {
    lockScroll,
    unlockScroll,
  };
}

// Export all hooks as named exports
export default {
  useMobileOptimizations,
  useHapticFeedback,
  useSafeArea,
  useViewportConstraints,
  useTouchDetection,
  useDisablePinchZoom,
  useFullscreenLayout,
};
