import React from 'react';
import { Video } from 'expo-av';
import { GestureModelEntry } from '../model';

export interface SymbolVideoPlayerProps {
  entry: GestureModelEntry;
  paused: boolean;
  useDgs?: boolean;
  onEnd?: () => void;
}

export default function SymbolVideoPlayer({ entry, paused, useDgs, onEnd }: SymbolVideoPlayerProps) {
  const path = useDgs ? entry.dgsVideoUri : entry.videoUri;
  const source = path
    ? { uri: path }
    : useDgs
      ? require(`../assets/videos/dgs/${entry.id}.mp4`)
      : require(`../assets/videos/${entry.id}.mp4`);

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
      resizeMode="contain"
      style={{ width: 300, height: 200 }}
    />
  );
}

