import React from 'react';
import { Video, ResizeMode } from 'expo-av';
import { GestureModelEntry } from '../model';

export interface SymbolVideoPlayerProps {
  entry: GestureModelEntry;
  paused: boolean;
  useDgs?: boolean;
  onEnd?: () => void;
}

export default function SymbolVideoPlayer({ entry, paused, useDgs, onEnd }: SymbolVideoPlayerProps) {
  const path = useDgs ? entry.dgsVideoUri : entry.videoUri;
  if (!path) {
    onEnd && onEnd();
    return null;
  }
  const source = { uri: path };

  return (
    <Video
      source={source}
      shouldPlay={!paused}
      onPlaybackStatusUpdate={(status) => {
        if (!paused && status.isLoaded && status.didJustFinish) {
          onEnd && onEnd();
        }
      }}
      useNativeControls
      resizeMode={ResizeMode.CONTAIN}
      style={{ width: 300, height: 200 }}
      accessibilityLabel={`Video ${entry.label}`}
    />
  );
}

