import React from 'react';
import { VideoView, useVideoPlayer } from 'expo-video';
import { GestureModelEntry } from '../model';
import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

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

  const player = useVideoPlayer(source, (player) => {
    player.addListener('playToEnd', () => {
      onEnd && onEnd();
    });
  });

  React.useEffect(() => {
    if (player) {
      if (!paused) {
        player.play();
      } else {
        player.pause();
      }
    }
  }, [player, paused]);

  return (
    <VideoView
      player={player}
      style={{ width: width, height: height }}
      contentFit={'contain'}
      accessibilityLabel={`Video ${entry.label}`}
    />
  );
}

