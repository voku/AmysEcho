/**
 * Slow Motion Replay Component Tests - Amy First
 *
 * Comprehensive tests for the slow-motion replay component that helps Amy learn gestures
 * through video playback at different speeds with gesture highlighting.
 */

// Mock Dimensions before importing the component
jest.mock('react-native/Libraries/Utilities/Dimensions', () => ({
  get: jest.fn(() => ({ width: 375, height: 812 })),
}));

// Mock StyleSheet
jest.mock('react-native/Libraries/StyleSheet/StyleSheet', () => ({
  create: jest.fn((styles) => styles),
  absoluteFillObject: {},
}));

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Animated } from 'react-native';
import SlowMotionReplay from '../../src/components/SlowMotionReplay';

// Mock expo-video
jest.mock('expo-video', () => ({
  VideoView: 'VideoView',
  useVideoPlayer: jest.fn(),
}));

// Mock LanguageManager
jest.mock('../../src/services/LanguageManager', () => ({
  LanguageManager: {
    t: jest.fn((key: string) => key),
  },
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));



const mockUseVideoPlayer = require('expo-video').useVideoPlayer;
const mockLanguageManager = require('../../src/services/LanguageManager').LanguageManager;

describe('SlowMotionReplay', () => {
  const mockPlayer = {
    play: jest.fn(),
    pause: jest.fn(),
    replay: jest.fn(),
    status: 'ready',
    duration: 10,
    playing: false,
    playbackRate: 1.0,
    addListener: jest.fn(() => ({
      remove: jest.fn(),
    })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseVideoPlayer.mockReturnValue(mockPlayer);
    mockLanguageManager.t.mockImplementation((key: string) => key);
  });

  describe('Rendering', () => {
    it('should not render when not visible', () => {
      const { queryByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={false}
        />
      );

      expect(queryByTestId('slow-motion-replay-container')).toBeNull();
    });

    it('should not render without video URI', () => {
      const { queryByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          isVisible={true}
        />
      );

      expect(queryByTestId('slow-motion-replay-container')).toBeNull();
    });

    it('should render with video URI and visible', () => {
      const { getByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
        />
      );

      expect(getByTestId('slow-motion-replay-container')).toBeTruthy();
      expect(getByTestId('slow-motion-replay-overlay')).toBeTruthy();
      expect(getByTestId('slow-motion-video-container')).toBeTruthy();
    });

    it('should show placeholder when no player available', () => {
      mockUseVideoPlayer.mockReturnValue(null);

      const { getByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
        />
      );

      expect(getByTestId('slow-motion-placeholder')).toBeTruthy();
    });

    it('should display gesture ID in title', () => {
      const { getByTestId } = render(
        <SlowMotionReplay
          gestureId="hello"
          videoUri="test-video.mp4"
          isVisible={true}
        />
      );

      const title = getByTestId('slow-motion-gesture-title');
      expect(title.children).toContain('hello');
    });

    it('should display current speed in indicator', () => {
      const { getByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          initialSpeed={0.75}
        />
      );

      const speedIndicator = getByTestId('slow-motion-speed-indicator');
      expect(speedIndicator.children).toContain('0.75x');
    });
  });

  describe('Video Playback', () => {
    it('should auto-play video when visible and autoPlay is true', () => {
      render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          autoPlay={true}
        />
      );

      expect(mockPlayer.play).toHaveBeenCalled();
    });

    it('should not auto-play when autoPlay is false', () => {
      render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          autoPlay={false}
        />
      );

      expect(mockPlayer.play).not.toHaveBeenCalled();
    });

    it('should pause video when not visible', () => {
      // Mock player as playing
      mockPlayer.playing = true;
      mockPlayer.status = 'ready';
      mockPlayer.duration = 10;

      const { rerender } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          autoPlay={true}
        />
      );

      // Video should be playing initially
      expect(mockPlayer.play).toHaveBeenCalled();

      // Hide component
      rerender(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={false}
          autoPlay={true}
        />
      );

      // Should pause when visibility changes
      waitFor(() => {
        expect(mockPlayer.pause).toHaveBeenCalled();
      });
    });

    it('should set correct playback rate', () => {
      render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          initialSpeed={0.5}
        />
      );

      expect(mockPlayer.playbackRate).toBe(0.5);
    });

    it('should handle video end events correctly', () => {
      const onReplayComplete = jest.fn();
      mockPlayer.addListener.mockImplementation((event, callback) => {
        if (event === 'playToEnd') {
          // Simulate video ending
          setTimeout(() => callback(), 0);
        }
        return { remove: jest.fn() };
      });

      render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          onReplayComplete={onReplayComplete}
        />
      );

      // Wait for the video end event
      waitFor(() => {
        expect(onReplayComplete).toHaveBeenCalled();
      });
    });
  });

  describe('User Interactions', () => {
    it('should call onClose when close button is pressed', () => {
      const onClose = jest.fn();
      const { getByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          onClose={onClose}
        />
      );

      const closeButton = getByTestId('slow-motion-close-button');
      fireEvent.press(closeButton);

      expect(onClose).toHaveBeenCalled();
    });

    it('should toggle playback when play/pause button is pressed', () => {
      const { getByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          showControls={true}
        />
      );

      const playPauseButton = getByTestId('slow-motion-play-pause-button');

      // Initially should be paused (not playing)
      fireEvent.press(playPauseButton);
      expect(mockPlayer.play).toHaveBeenCalled();

      // Mock playing state and press again
      mockPlayer.playing = true;
      fireEvent.press(playPauseButton);
      expect(mockPlayer.pause).toHaveBeenCalled();
    });

    it('should restart playback when restart button is pressed', () => {
      const { getByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          showControls={true}
        />
      );

      const restartButton = getByTestId('slow-motion-restart-button');
      fireEvent.press(restartButton);

      expect(mockPlayer.replay).toHaveBeenCalled();
    });

    it('should show speed controls when speed button is pressed', () => {
      const { getByTestId, queryByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          showControls={true}
        />
      );

      // Speed controls should not be visible initially
      expect(queryByTestId('slow-motion-speed-controls')).toBeNull();

      const speedButton = getByTestId('slow-motion-speed-button');
      fireEvent.press(speedButton);

      expect(getByTestId('slow-motion-speed-controls')).toBeTruthy();
    });

    it('should change speed when speed button is pressed', () => {
      const { getByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          showControls={true}
        />
      );

      // Show speed controls
      const speedButton = getByTestId('slow-motion-speed-button');
      fireEvent.press(speedButton);

      // Press 0.5x speed button
      const speed05Button = getByTestId('slow-motion-speed-0.5');
      fireEvent.press(speed05Button);

      expect(mockPlayer.playbackRate).toBe(0.5);
    });

    it('should hide speed controls after selecting speed', () => {
      const { getByTestId, queryByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          showControls={true}
        />
      );

      // Show speed controls
      const speedButton = getByTestId('slow-motion-speed-button');
      fireEvent.press(speedButton);

      // Press a speed button
      const speed05Button = getByTestId('slow-motion-speed-0.5');
      fireEvent.press(speed05Button);

      // Speed controls should be hidden
      expect(queryByTestId('slow-motion-speed-controls')).toBeNull();
    });
  });

  describe('Speed Controls', () => {
    it('should render all speed options', () => {
      const { getByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          showControls={true}
        />
      );

      // Show speed controls
      const speedButton = getByTestId('slow-motion-speed-button');
      fireEvent.press(speedButton);

      // Check all speed buttons exist
      expect(getByTestId('slow-motion-speed-0.25')).toBeTruthy();
      expect(getByTestId('slow-motion-speed-0.5')).toBeTruthy();
      expect(getByTestId('slow-motion-speed-0.75')).toBeTruthy();
      expect(getByTestId('slow-motion-speed-1')).toBeTruthy();
      expect(getByTestId('slow-motion-speed-1.25')).toBeTruthy();
      expect(getByTestId('slow-motion-speed-1.5')).toBeTruthy();
      expect(getByTestId('slow-motion-speed-2')).toBeTruthy();
    });

    it('should highlight active speed', () => {
      const { getByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          showControls={true}
          initialSpeed={0.5}
        />
      );

      // Show speed controls
      const speedButton = getByTestId('slow-motion-speed-button');
      fireEvent.press(speedButton);

      const speed05Button = getByTestId('slow-motion-speed-0.5');
      // The active button should have different styling (checked via props)
      expect(speed05Button.props.style).toEqual(
        expect.arrayContaining([
          expect.any(Object), // base style
          expect.any(Object), // active style
        ])
      );
    });
  });

  describe('Controls Visibility', () => {
    it('should show controls when showControls is true', () => {
      const { getByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          showControls={true}
        />
      );

      expect(getByTestId('slow-motion-control-bar')).toBeTruthy();
    });

    it('should not show controls when showControls is false', () => {
      const { queryByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          showControls={false}
        />
      );

      expect(queryByTestId('slow-motion-control-bar')).toBeNull();
    });
  });

  describe('Learning Tips', () => {
    it('should display learning tips section', () => {
      const { getByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
        />
      );

      expect(getByTestId('slow-motion-tips-container')).toBeTruthy();
      expect(getByTestId('slow-motion-tips-title')).toBeTruthy();
      expect(getByTestId('slow-motion-tips-text')).toBeTruthy();
    });

    it('should use LanguageManager for tips text', () => {
      render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
        />
      );

      expect(mockLanguageManager.t).toHaveBeenCalledWith('slowMotionReplay.tipsTitle');
      expect(mockLanguageManager.t).toHaveBeenCalledWith('slowMotionReplay.tipsText');
    });
  });

  describe('Animations', () => {
    it('should animate opacity when visibility changes', () => {
      const { getByTestId, rerender } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
        />
      );

      const container = getByTestId('slow-motion-replay-container');
      const styleArray = container.props.style;

      // Check that opacity is part of the animated style
      expect(styleArray).toEqual(
        expect.arrayContaining([
          expect.any(Object), // The Animated.Value for opacity
        ])
      );

      // Make not visible
      rerender(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={false}
        />
      );

      // Component should not render when not visible
      expect(() => getByTestId('slow-motion-replay-container')).toThrow();
    });
  });

  describe('Accessibility', () => {
    it('should have correct accessibility labels', () => {
      const { getByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          showControls={true}
        />
      );

      const video = getByTestId('slow-motion-video');
      expect(video.props.accessibilityLabel).toBe('slowMotionReplay.video test-gesture');

      const closeButton = getByTestId('slow-motion-close-button');
      expect(closeButton.props.accessibilityLabel).toBe('slowMotionReplay.close');

      const restartButton = getByTestId('slow-motion-restart-button');
      expect(restartButton.props.accessibilityLabel).toBe('slowMotionReplay.restart');

      const speedButton = getByTestId('slow-motion-speed-button');
      expect(speedButton.props.accessibilityLabel).toBe('slowMotionReplay.changeSpeed');
    });

    it('should update play/pause button accessibility label based on playing state', () => {
      // Mock playing state
      mockPlayer.playing = true;

      const { getByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          showControls={true}
        />
      );

      const playPauseButton = getByTestId('slow-motion-play-pause-button');
      expect(playPauseButton.props.accessibilityLabel).toBe('slowMotionReplay.pause');
    });

    it('should have accessibility labels for speed buttons', () => {
      const { getByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          showControls={true}
        />
      );

      // Show speed controls
      const speedButton = getByTestId('slow-motion-speed-button');
      fireEvent.press(speedButton);

      const speed05Button = getByTestId('slow-motion-speed-0.5');
      expect(speed05Button.props.accessibilityLabel).toBe('0.5x slowMotionReplay.speed');
    });
  });

  describe('Error Handling', () => {
    it('should handle video player errors', () => {
      const mockLogger = require('../../src/utils/logger').logger;

      mockPlayer.addListener.mockImplementation((event, callback) => {
        if (event === 'statusChange') {
          setTimeout(() => callback({ error: 'Video load failed' }), 0);
        }
        return { remove: jest.fn() };
      });

      render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
        />
      );

      waitFor(() => {
        expect(mockLogger.error).toHaveBeenCalledWith(
          'SlowMotionReplay video error',
          { error: 'Video load failed' }
        );
      });
    });

    it('should handle missing video player gracefully', () => {
      mockUseVideoPlayer.mockReturnValue(null);

      expect(() => {
        render(
          <SlowMotionReplay
            gestureId="test-gesture"
            videoUri="test-video.mp4"
            isVisible={true}
          />
        );
      }).not.toThrow();
    });
  });

  describe('Language Support', () => {
    it('should use LanguageManager for all text', () => {
      render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          showControls={true}
        />
      );

      expect(mockLanguageManager.t).toHaveBeenCalledWith('slowMotionReplay.title');
      expect(mockLanguageManager.t).toHaveBeenCalledWith('slowMotionReplay.speedLabel');
      expect(mockLanguageManager.t).toHaveBeenCalledWith('slowMotionReplay.video');
      expect(mockLanguageManager.t).toHaveBeenCalledWith('slowMotionReplay.loading');
      expect(mockLanguageManager.t).toHaveBeenCalledWith('slowMotionReplay.restart');
      expect(mockLanguageManager.t).toHaveBeenCalledWith('slowMotionReplay.play');
      expect(mockLanguageManager.t).toHaveBeenCalledWith('slowMotionReplay.changeSpeed');
      expect(mockLanguageManager.t).toHaveBeenCalledWith('slowMotionReplay.close');
      expect(mockLanguageManager.t).toHaveBeenCalledWith('slowMotionReplay.tipsTitle');
      expect(mockLanguageManager.t).toHaveBeenCalledWith('slowMotionReplay.tipsText');
    });
  });

  describe('Auto-hide Controls', () => {
    it('should auto-hide speed controls after timeout', async () => {
      jest.useFakeTimers();

      const { getByTestId, queryByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          showControls={true}
        />
      );

      // Show speed controls
      const speedButton = getByTestId('slow-motion-speed-button');
      fireEvent.press(speedButton);

      expect(getByTestId('slow-motion-speed-controls')).toBeTruthy();

      // Fast-forward time
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      // Speed controls should be hidden
      expect(queryByTestId('slow-motion-speed-controls')).toBeNull();

      jest.useRealTimers();
    });

    it('should reset auto-hide timer when interacting with controls', () => {
      jest.useFakeTimers();

      const { getByTestId } = render(
        <SlowMotionReplay
          gestureId="test-gesture"
          videoUri="test-video.mp4"
          isVisible={true}
          showControls={true}
        />
      );

      // Show speed controls
      const speedButton = getByTestId('slow-motion-speed-button');
      fireEvent.press(speedButton);

      // Wait 2 seconds
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      // Interact again (should reset timer)
      fireEvent.press(speedButton);

      // Wait another 2 seconds (total 4 seconds)
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      // Controls should still be visible (timer was reset)
      expect(getByTestId('slow-motion-speed-controls')).toBeTruthy();

      jest.useRealTimers();
    });
  });
});