import React from 'react';
import renderer, { act } from 'react-test-renderer';

import { ActivityIndicator } from 'react-native';

import DgsVideoPlayer from '../src/components/DgsVideoPlayer';

const PLAY_VIDEO_LABEL = 'Video abspielen';
const PAUSE_VIDEO_LABEL = 'Video pausieren';

jest.mock('../src/utils/logger', () => ({
  logger: { error: jest.fn() },
}));

const play = jest.fn();
const pause = jest.fn();
const mockPlayer: any = {
  status: 'loading',
  duration: 10,
  currentTime: 0,
  playing: false,
  play,
  pause,
  replay: jest.fn(),
  addListener: jest.fn((event: string, cb: Function) => {
    return { remove: jest.fn() };
  }),
};

jest.mock('expo-video', () => ({
  VideoView: () => null,
  useVideoPlayer: () => mockPlayer,
}));

describe('DgsVideoPlayer performance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayer.status = 'loading';
    mockPlayer.playing = false;
    mockPlayer.currentTime = 0;
    mockPlayer.replay.mockClear();
  });

  it('shows a loading indicator while buffering', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <DgsVideoPlayer videoSource={{ uri: 'foo' }} shouldPlay />
      );
    });
    const loading = (component as renderer.ReactTestRenderer).root.findAllByType(ActivityIndicator);
    expect(loading.length).toBe(1);
  });

  it('starts playback quickly after loading', () => {
    const start = Date.now();
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <DgsVideoPlayer videoSource={{ uri: 'foo' }} shouldPlay />
      );
    });
    mockPlayer.status = 'ready';
    act(() => {
      (component as renderer.ReactTestRenderer).update(
        <DgsVideoPlayer videoSource={{ uri: 'foo' }} shouldPlay />
      );
    });
    expect(play).toHaveBeenCalled();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it('allows manual play and pause', () => {
    mockPlayer.status = 'ready';
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <DgsVideoPlayer videoSource={{ uri: 'foo' }} shouldPlay={false} />
      );
    });
    const playBtn = (component as renderer.ReactTestRenderer).root.findByProps({
      accessibilityLabel: PLAY_VIDEO_LABEL,
    });
    act(() => {
      playBtn.props.onPress();
    });
    expect(play).toHaveBeenCalled();

    mockPlayer.playing = true;

    const pauseBtn = (component as renderer.ReactTestRenderer).root.findByProps({
      accessibilityLabel: PAUSE_VIDEO_LABEL,
    });
    act(() => {
      pauseBtn.props.onPress();
    });
    expect(pause).toHaveBeenCalled();
  });

  it('stops playback when the video ends', () => {
    mockPlayer.status = 'ready';
    mockPlayer.playing = true;
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <DgsVideoPlayer videoSource={{ uri: 'foo' }} shouldPlay />
      );
    });
    const playToEndHandler = mockPlayer.addListener.mock.calls.find((call) => call[0] === 'playToEnd')?.[1] as Function | undefined;
    expect(typeof playToEndHandler).toBe('function');
    // simulate video ending
    act(() => {
      mockPlayer.playing = false;
      playToEndHandler?.();
    });
    expect(mockPlayer.replay).not.toHaveBeenCalled();
    const playBtn = (component as renderer.ReactTestRenderer).root.findByProps({
      accessibilityLabel: PLAY_VIDEO_LABEL,
    });
    expect(playBtn).toBeDefined();
  });
});
