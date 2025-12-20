import { useRef, useCallback, useEffect, useState } from 'react';

/**
 * Generate a simple beep sound using Web Audio API as fallback
 * @param {number} volume - Volume level between 0 and 1
 */
const playBeepFallback = (volume = 0.7) => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800; // Frequency in Hz
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.error('Fallback beep failed:', error);
  }
};

/**
 * Custom hook for playing audio notifications with fallback mechanisms
 * and cross-browser compatibility
 * 
 * @param {string} soundPath - Path to the audio file (default: '/assets/sounds/notification.mp3')
 * @param {number} volume - Volume level between 0 and 1 (default: 0.7)
 * @returns {Object} - { playNotification, isSupported, setVolume }
 */
export default function useAudioNotification(
  soundPath = '/assets/sounds/notification.mp3',
  volume = 0.7
) {
  const audioRef = useRef(null);
  const [isSupported, setIsSupported] = useState(true);
  const [currentVolume, setCurrentVolume] = useState(volume);
  const lastPlayedRef = useRef(0);
  const useFallbackRef = useRef(false);
  const MIN_INTERVAL = 1000; // Minimum 1 second between notifications to prevent duplicates

  // Initialize audio on mount
  useEffect(() => {
    try {
      // Create audio element
      const audio = new Audio(soundPath);
      audio.volume = currentVolume;
      
      // Preload the audio
      audio.preload = 'auto';
      
      // Test if audio is supported
      if (typeof audio.play !== 'function') {
        console.warn('Audio playback not supported in this browser');
        setIsSupported(false);
        return;
      }
      
      audioRef.current = audio;

      // Handle audio errors - use fallback beep
      audio.addEventListener('error', (e) => {
        console.warn('Audio file not found, using fallback beep:', e);
        useFallbackRef.current = true;
      });

      // Cleanup
      return () => {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
      };
    } catch (error) {
      console.error('Failed to initialize audio:', error);
      setIsSupported(false);
    }
  }, [soundPath, currentVolume]);

  /**
   * Play the notification sound with duplicate prevention
   * @returns {Promise<boolean>} - Returns true if played successfully, false otherwise
   */
  const playNotification = useCallback(async () => {
    const now = Date.now();
    
    // Prevent duplicate notifications within MIN_INTERVAL
    if (now - lastPlayedRef.current < MIN_INTERVAL) {
      console.log('Notification throttled - too soon after last play');
      return false;
    }

    // Use fallback beep if audio file failed to load
    if (useFallbackRef.current) {
      try {
        playBeepFallback(currentVolume);
        lastPlayedRef.current = now;
        return true;
      } catch (error) {
        console.error('Fallback beep failed:', error);
        return false;
      }
    }

    if (!audioRef.current || !isSupported) {
      console.warn('Audio notification not available');
      return false;
    }

    try {
      // Reset audio to start if it's already playing
      audioRef.current.currentTime = 0;
      
      // Attempt to play
      await audioRef.current.play();
      lastPlayedRef.current = now;
      return true;
    } catch (error) {
      // Handle autoplay policy restrictions
      if (error.name === 'NotAllowedError') {
        console.warn(
          'Audio playback blocked by browser autoplay policy. User interaction required.',
          error
        );
      } else if (error.name === 'NotSupportedError') {
        // Try fallback beep
        console.warn('Audio format not supported, trying fallback beep');
        useFallbackRef.current = true;
        playBeepFallback(currentVolume);
        lastPlayedRef.current = now;
        return true;
      } else {
        console.error('Error playing notification sound:', error);
      }
      return false;
    }
  }, [isSupported, currentVolume]);

  /**
   * Update the volume level
   * @param {number} newVolume - Volume level between 0 and 1
   */
  const setVolume = useCallback((newVolume) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setCurrentVolume(clampedVolume);
    if (audioRef.current) {
      audioRef.current.volume = clampedVolume;
    }
  }, []);

  return {
    playNotification,
    isSupported,
    setVolume,
    volume: currentVolume,
  };
}
