/**
 * DGS Video Player Component
 * 
 * Plays Deutsche Gebärdensprache (German Sign Language) tutorial videos
 * with accessibility features and playback controls.
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
  /** Show controls */
  controls?: boolean;
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

export const DgsVideoPlayer: React.FC<DgsVideoPlayerProps> = ({
  src,
  title,
  poster,
  autoPlay = false,
  loop = false,
  muted = true,
  controls = true,
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

  // Update playback speed when prop changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, [speed]);

  // Handle video load
  const handleLoadedData = useCallback(() => {
    setIsLoading(false);
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
    onLoad?.();
  }, [onLoad]);

  // Handle video error
  const handleError = useCallback(() => {
    const errorMessage = 'Video konnte nicht geladen werden';
    setError(errorMessage);
    setIsLoading(false);
    onError?.(new Error(errorMessage));
  }, [onError]);

  // Handle time update
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  // Handle play
  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    onPlay?.();
  }, [onPlay]);

  // Handle pause
  const handlePause = useCallback(() => {
    setIsPlaying(false);
    onPause?.();
  }, [onPause]);

  // Handle ended
  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    onEnded?.();
  }, [onEnded]);

  // Play/Pause toggle
  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {
          // Handle autoplay restrictions
        });
      }
    }
  }, [isPlaying]);

  // Restart video
  const restart = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  // Change playback speed
  const changeSpeed = useCallback((newSpeed: number) => {
    const clampedSpeed = Math.max(0.25, Math.min(2.0, newSpeed));
    setSpeed(clampedSpeed);
    if (videoRef.current) {
      videoRef.current.playbackRate = clampedSpeed;
    }
  }, []);

  // Seek to position
  const seekTo = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(time, duration));
    }
  }, [duration]);

  // Format time display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Progress percentage
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`dgs-video-player ${className}`} style={{ width, maxWidth: '100%' }}>
      {/* Video Element */}
      <div className="dgs-video-container" style={{ position: 'relative' }}>
        {isLoading && (
          <div className="dgs-video-loading" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 10,
          }}>
            <div className="loading-spinner" style={{
              width: '40px',
              height: '40px',
              border: '3px solid #e0e0e0',
              borderTop: '3px solid #6b46c1',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <p style={{ marginTop: '8px', color: '#666' }}>Laden...</p>
          </div>
        )}

        {error && (
          <div className="dgs-video-error" style={{
            padding: '20px',
            textAlign: 'center',
            backgroundColor: '#fee2e2',
            borderRadius: '8px',
          }}>
            <p style={{ color: '#dc2626', marginBottom: '10px' }}>⚠️ {error}</p>
            <button
              onClick={() => {
                setError(null);
                setIsLoading(true);
                videoRef.current?.load();
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6b46c1',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Erneut versuchen
            </button>
          </div>
        )}

        <video
          ref={videoRef}
          src={src}
          poster={poster}
          autoPlay={autoPlay}
          loop={loop}
          muted={muted}
          controls={controls}
          playsInline
          onLoadedData={handleLoadedData}
          onError={handleError}
          onTimeUpdate={handleTimeUpdate}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          aria-label={title}
          style={{
            width: '100%',
            height,
            borderRadius: '8px',
            backgroundColor: '#000',
            display: error ? 'none' : 'block',
          }}
        >
          <track kind="captions" label="Deutsch" />
          Dein Browser unterstützt keine Videos.
        </video>
      </div>

      {/* Custom Controls (when native controls are disabled) */}
      {!controls && !error && (
        <div className="dgs-video-controls" style={{
          marginTop: '10px',
          padding: '10px',
          backgroundColor: '#f3f4f6',
          borderRadius: '8px',
        }}>
          {/* Progress Bar */}
          <div style={{ marginBottom: '10px' }}>
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={(e) => seekTo(parseFloat(e.target.value))}
              aria-label="Videoposition"
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666' }}>
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Control Buttons */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center' }}>
            <button
              onClick={restart}
              aria-label="Neustart"
              style={{
                padding: '8px 12px',
                backgroundColor: '#e5e7eb',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              ⏮️
            </button>

            <button
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Abspielen'}
              style={{
                padding: '12px 20px',
                backgroundColor: '#6b46c1',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '18px',
              }}
            >
              {isPlaying ? '⏸️' : '▶️'}
            </button>

            {/* Speed Controls */}
            <select
              value={speed}
              onChange={(e) => changeSpeed(parseFloat(e.target.value))}
              aria-label="Wiedergabegeschwindigkeit"
              style={{
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                backgroundColor: 'white',
              }}
            >
              <option value="0.25">0.25x</option>
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
          </div>
        </div>
      )}

      {/* Speed indicator for native controls */}
      {controls && !error && (
        <div style={{
          marginTop: '8px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{ fontSize: '14px', color: '#666' }}>Geschwindigkeit:</span>
          {[0.5, 0.75, 1, 1.25, 1.5].map((s) => (
            <button
              key={s}
              onClick={() => changeSpeed(s)}
              style={{
                padding: '4px 8px',
                backgroundColor: speed === s ? '#6b46c1' : '#e5e7eb',
                color: speed === s ? 'white' : '#374151',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      )}

      {/* Accessibility description */}
      <p className="sr-only" aria-live="polite">
        {isPlaying ? `Video wird abgespielt: ${title}` : `Video pausiert: ${title}`}
        , Fortschritt: {Math.round(progress)}%
      </p>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
      `}</style>
    </div>
  );
};

export default DgsVideoPlayer;
