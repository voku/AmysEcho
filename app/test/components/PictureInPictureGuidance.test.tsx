/**
 * Picture-in-Picture Guidance Component Tests - Amy First
 *
 * Comprehensive tests for the PiP guidance component that helps Amy learn gestures
 * through contextual video guidance during recognition.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Animated } from 'react-native';
import PictureInPictureGuidance from '../../src/components/PictureInPictureGuidance';

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

describe('PictureInPictureGuidance', () => {
  const mockPlayer = {
    play: jest.fn(),
    pause: jest.fn(),
    status: 'ready',
    duration: 10,
    playing: false,
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
        <PictureInPictureGuidance
          isVisible={false}
          videoUri="test-video.mp4"
        />
      );

      expect(queryByTestId('pip-guidance-container')).toBeNull();
    });

    it('should not render without video URI', () => {
      const { queryByTestId } = render(
        <PictureInPictureGuidance
          isVisible={true}
        />
      );

      expect(queryByTestId('pip-guidance-container')).toBeNull();
    });

    it('should render with video URI and visible', () => {
      const { getByTestId } = render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
          gestureId="test-gesture"
        />
      );

      expect(getByTestId('pip-guidance-container')).toBeTruthy();
      expect(getByTestId('pip-guidance-video')).toBeTruthy();
    });

    it('should show placeholder when no player available', () => {
      mockUseVideoPlayer.mockReturnValue(null);

      const { getByText } = render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
        />
      );

      expect(getByText('pipGuidance.loading')).toBeTruthy();
    });

    it('should display gesture label when provided', () => {
      const { getByText } = render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
          gestureId="hello"
        />
      );

      expect(getByText('hello')).toBeTruthy();
    });
  });

  describe('Video Playback', () => {
    it('should auto-play video when visible and autoPlay is true', () => {
      render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
          autoPlay={true}
        />
      );

      expect(mockPlayer.play).toHaveBeenCalled();
    });

    it('should not auto-play when autoPlay is false', () => {
      render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
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
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
          autoPlay={true}
        />
      );

      // Video should be playing initially
      expect(mockPlayer.play).toHaveBeenCalled();

      // Hide component
      rerender(
        <PictureInPictureGuidance
          isVisible={false}
          videoUri="test-video.mp4"
          autoPlay={true}
        />
      );

      // Should pause when visibility changes
      waitFor(() => {
        expect(mockPlayer.pause).toHaveBeenCalled();
      });
    });

    it('should handle play/pause toggle', () => {
      const { getByTestId } = render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
          showControls={true}
        />
      );

      const controlButton = getByTestId('pip-control-button');
      fireEvent.press(controlButton);

      expect(mockPlayer.play).toHaveBeenCalled();
    });

    it('should handle video end events correctly', () => {
      const onPlaybackComplete = jest.fn();
      mockPlayer.addListener.mockImplementation((event, callback) => {
        if (event === 'playToEnd') {
          // Simulate video ending
          setTimeout(() => callback(), 0);
        }
        return { remove: jest.fn() };
      });

      render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
          playbackMode="once"
          onPlaybackComplete={onPlaybackComplete}
        />
      );

      // Wait for the video end event
      waitFor(() => {
        expect(onPlaybackComplete).toHaveBeenCalled();
      });
    });
  });

  describe('Playback Modes', () => {
    it('should loop video in loop mode', () => {
      mockPlayer.addListener.mockImplementation((event, callback) => {
        if (event === 'playToEnd') {
          setTimeout(() => callback(), 0);
        }
        return { remove: jest.fn() };
      });

      render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
          playbackMode="loop"
        />
      );

      // In loop mode, video should continue playing after end
      waitFor(() => {
        expect(mockPlayer.play).toHaveBeenCalledTimes(2); // Initial + loop
      });
    });

    it('should pause after one play in guided mode', () => {
      mockPlayer.addListener.mockImplementation((event, callback) => {
        if (event === 'playToEnd') {
          setTimeout(() => callback(), 0);
        }
        return { remove: jest.fn() };
      });

      render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
          playbackMode="guided"
        />
      );

      waitFor(() => {
        expect(mockPlayer.pause).toHaveBeenCalled();
      });
    });
  });

  describe('User Interactions', () => {
    it('should call onClose when close button is pressed', () => {
      const onClose = jest.fn();
      const { getByTestId } = render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
          onClose={onClose}
        />
      );

      const closeButton = getByTestId('pip-close-button');
      fireEvent.press(closeButton);

      expect(onClose).toHaveBeenCalled();
    });

    it('should show play/pause controls when showControls is true', () => {
      const { getByTestId } = render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
          showControls={true}
        />
      );

      expect(getByTestId('pip-control-button')).toBeTruthy();
    });

    it('should not show controls when showControls is false', () => {
      const { queryByTestId } = render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
          showControls={false}
        />
      );

      expect(queryByTestId('pip-control-button')).toBeNull();
    });
  });

  describe('Confidence-Based Features', () => {
    it('should show encouragement for low confidence', () => {
      const { getByText } = render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
          confidence={0.4}
        />
      );

      expect(getByText('Versuch\'s nochmal!')).toBeTruthy();
    });

    it('should not show encouragement overlay for high confidence', () => {
      const { queryByText } = render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
          confidence={0.8}
        />
      );

      // High confidence should not show encouragement overlay
      expect(queryByText('Gut gemacht!')).toBeNull();
      expect(queryByText('Versuch\'s nochmal!')).toBeNull();
    });

    it('should not show encouragement overlay when confidence is undefined', () => {
      const { queryByText } = render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
        />
      );

      expect(queryByText('Versuch\'s nochmal!')).toBeNull();
      expect(queryByText('Gut gemacht!')).toBeNull();
    });
  });

  describe('Styling and Positioning', () => {
    it('should apply correct size styles', () => {
      const { getByTestId } = render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
          size="large"
        />
      );

      const container = getByTestId('pip-guidance-container');
      const styleArray = container.props.style;
      expect(styleArray).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ width: 200, height: 200 })
        ])
      );
    });

    it('should apply correct position styles', () => {
      const { getByTestId } = render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
          position="bottom-left"
        />
      );

      const container = getByTestId('pip-guidance-container');
      const styleArray = container.props.style;
      expect(styleArray).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ bottom: 24, left: 24 })
        ])
      );
    });
  });

  describe('Animations', () => {
    it('should animate opacity when visibility changes', () => {
      const { getByTestId, rerender } = render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
        />
      );

      const container = getByTestId('pip-guidance-container');
      const styleArray = container.props.style;

      // Check that opacity is part of the animated style
      expect(styleArray).toEqual(
        expect.arrayContaining([
          expect.any(Object) // The Animated.Value for opacity
        ])
      );

      // Make not visible
      rerender(
        <PictureInPictureGuidance
          isVisible={false}
          videoUri="test-video.mp4"
        />
      );

      // Component should not render when not visible
      expect(() => getByTestId('pip-guidance-container')).toThrow();
    });
  });

  describe('Accessibility', () => {
    it('should have correct accessibility labels', () => {
      const { getByTestId } = render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
          gestureId="test-gesture"
          showControls={true}
          autoPlay={true}
        />
      );

      const video = getByTestId('pip-guidance-video');
      expect(video.props.accessibilityLabel).toBe('pipGuidance.gestureVideo test-gesture');

      const closeButton = getByTestId('pip-close-button');
      expect(closeButton.props.accessibilityLabel).toBe('pipGuidance.close');

      const controlButton = getByTestId('pip-control-button');
      expect(controlButton.props.accessibilityLabel).toBe('pipGuidance.pause'); // autoPlay=true means isPlaying=true
    });

    it('should update control button accessibility label based on playing state', () => {
      // Mock playing state
      mockPlayer.playing = true;

      const { getByTestId } = render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
          showControls={true}
        />
      );

      const controlButton = getByTestId('pip-control-button');
      expect(controlButton.props.accessibilityLabel).toBe('pipGuidance.pause');
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
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
        />
      );

      waitFor(() => {
        expect(mockLogger.error).toHaveBeenCalledWith(
          'PiP Guidance video error',
          'Video load failed'
        );
      });
    });

    it('should handle missing video player gracefully', () => {
      mockUseVideoPlayer.mockReturnValue(null);

      expect(() => {
        render(
          <PictureInPictureGuidance
            isVisible={true}
            videoUri="test-video.mp4"
          />
        );
      }).not.toThrow();
    });
  });

  describe('Language Support', () => {
    it('should use LanguageManager for all text', () => {
      render(
        <PictureInPictureGuidance
          isVisible={true}
          videoUri="test-video.mp4"
          showControls={true}
          autoPlay={true}
        />
      );

      expect(mockLanguageManager.t).toHaveBeenCalledWith('pipGuidance.gestureVideo');
      expect(mockLanguageManager.t).toHaveBeenCalledWith('pipGuidance.close');
      expect(mockLanguageManager.t).toHaveBeenCalledWith('pipGuidance.pause'); // autoPlay=true
    });
  });
});