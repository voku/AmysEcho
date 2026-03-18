/**
 * DGS Video Player Component — Kid-Friendly Edition
 *
 * YouTube-like player designed for young children (4+).
 * Large touch targets, emoji-based controls, no download option,
 * big centered play/pause overlay, colorful progress bar.
 *
 * Amy First: Zero confusion, instant feedback, simple controls.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';

export interface DgsVideoPlayerProps {
  /** Video source URL */
  src: string;
  /** Video title for accessibility */
  title: string;
  /** Poster image URL */
  poster?: string;
  /** Auto-play on mount */
  autoPlay?: boolean;
  /** Loop video */
  loop?: boolean;
  /** Muted by default */
  muted?: boolean;
  /** Playback speed (0.5 - 2.0) */
  playbackSpeed?: number;
  /** Callback when video ends */
  onEnded?: () => void;
  /** Callback when video starts playing */
  onPlay?: () => void;
  /** Callback when video pauses */
  onPause?: () => void;
  /** Callback when video loads */
  onLoad?: () => void;
  /** Callback when video has an error */
  onError?: (error: Error) => void;
  /** CSS class name */
  className?: string;
  /** Width */
  width?: number | string;
  /** Height */
  height?: number | string;
}

/** Speed presets with kid-friendly emoji labels */
const SPEED_PRESETS: { value: number; emoji: string; label: string }[] = [
  { value: 0.5, emoji: '🐢', label: 'Langsam' },
  { value: 1.0, emoji: '🐇', label: 'Normal' },
  { value: 1.5, emoji: '🐆', label: 'Schnell' },
];

export const DgsVideoPlayer: React.FC<DgsVideoPlayerProps> = ({
  src,
  title,
  poster,
  autoPlay = false,
  loop = false,
  muted = true,
  playbackSpeed = 1.0,
  onEnded,
  onPlay,
  onPause,
  onLoad,
  onError,
  className = '',
  width = '100%',
  height = 'auto',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(playbackSpeed);
  const [showOverlay, setShowOverlay] = useState(false);

  // Update playback speed when prop changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, [speed]);

  // Show overlay briefly on pause
  useEffect(() => {
    if (!isPlaying) {
      setShowOverlay(true);
    }
  }, [isPlaying]);

  const handleLoadedData = useCallback(() => {
    setIsLoading(false);
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(() => {
    const errorMessage = 'Video konnte nicht geladen werden';
    setError(errorMessage);
    setIsLoading(false);
    onError?.(new Error(errorMessage));
  }, [onError]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    setShowOverlay(false);
    onPlay?.();
  }, [onPlay]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    onPause?.();
  }, [onPause]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    onEnded?.();
  }, [onEnded]);

  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
      }
    }
  }, [isPlaying]);

  const restart = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  const changeSpeed = useCallback((newSpeed: number) => {
    const clampedSpeed = Math.max(0.25, Math.min(2.0, newSpeed));
    setSpeed(clampedSpeed);
    if (videoRef.current) {
      videoRef.current.playbackRate = clampedSpeed;
    }
  }, []);

  const seekTo = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(time, duration));
    }
  }, [duration]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  /** Prevent right-click context menu (no download option) */
  const preventContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      className={`dgs-video-player ${className}`}
      style={{ width, maxWidth: '100%' }}
    >
      {/* Video container with overlay */}
      <div
        className="dgs-video-container"
        onClick={togglePlay}
        onContextMenu={preventContextMenu}
        role="button"
        tabIndex={0}
        aria-label={isPlaying ? 'Pause' : 'Abspielen'}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            togglePlay();
          }
        }}
      >
        {/* Loading spinner */}
        {isLoading && (
          <div className="dgs-video-loading">
            <div className="dgs-loading-spinner" />
            <p className="dgs-loading-text">Laden...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="dgs-video-error">
            <p className="dgs-error-text">⚠️ {error}</p>
            <button
              className="dgs-retry-button"
              onClick={(e) => {
                e.stopPropagation();
                setError(null);
                setIsLoading(true);
                videoRef.current?.load();
              }}
            >
              🔄 Erneut versuchen
            </button>
          </div>
        )}

        {/* Big centered play overlay (YouTube-like) */}
        {!isLoading && !error && showOverlay && !isPlaying && (
          <div className="dgs-play-overlay">
            <div className="dgs-play-overlay-button" aria-hidden="true">
              ▶️
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          src={src}
          poster={poster}
          autoPlay={autoPlay}
          loop={loop}
          muted={muted}
          playsInline
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
          onLoadedData={handleLoadedData}
          onError={handleError}
          onTimeUpdate={handleTimeUpdate}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onContextMenu={preventContextMenu}
          aria-label={title}
          style={{
            width: '100%',
            height,
            display: error ? 'none' : 'block',
          }}
          className="dgs-video-element"
        >
          <track kind="captions" label="Deutsch" />
          Dein Browser unterstützt keine Videos.
        </video>
      </div>

      {/* Kid-friendly controls bar */}
      {!error && (
        <div className="dgs-kid-controls">
          {/* Colorful progress bar */}
          <div className="dgs-progress-wrapper">
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={(e) => seekTo(parseFloat(e.target.value))}
              aria-label="Videoposition"
              className="dgs-progress-bar"
              style={{
                background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${progress}%, #e5e7eb ${progress}%, #e5e7eb 100%)`,
              }}
            />
            <div className="dgs-time-display">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Large control buttons */}
          <div className="dgs-control-buttons">
            {/* Restart */}
            <button
              onClick={restart}
              aria-label="Neustart"
              className="dgs-control-btn"
              title="Nochmal von vorne"
            >
              ⏮️
            </button>

            {/* Big play/pause */}
            <button
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Abspielen'}
              className="dgs-control-btn dgs-control-btn-primary"
            >
              {isPlaying ? '⏸️' : '▶️'}
            </button>

            {/* Speed presets — emoji buttons */}
            <div className="dgs-speed-buttons" role="group" aria-label="Geschwindigkeit">
              {SPEED_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => changeSpeed(preset.value)}
                  aria-label={preset.label}
                  title={preset.label}
                  className={`dgs-speed-btn ${speed === preset.value ? 'active' : ''}`}
                >
                  {preset.emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Accessibility description */}
      <p className="sr-only" aria-live="polite">
        {isPlaying ? `Video wird abgespielt: ${title}` : `Video pausiert: ${title}`}
        , Fortschritt: {Math.round(progress)}%
      </p>
    </div>
  );
};

export default DgsVideoPlayer;
