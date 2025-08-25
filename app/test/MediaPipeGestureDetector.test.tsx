import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { MediaPipeGestureDetector } from '../src/components/MediaPipeGestureDetector';
import { LanguageManager } from '../src/services/LanguageManager';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    StyleSheet: { create: (styles: any) => styles },
  };
});

jest.mock('react-native-webview', () => ({
  WebView: (props: any) => <mock-webview {...props} />,
}));

jest.mock('../src/services/dgsModelClient', () => ({
  getCachedMlpModel: jest.fn(() => Promise.resolve(null)),
  fetchMlpModel: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('../src/storage', () => ({
  loadActiveProfileId: jest.fn(() => Promise.resolve(null)),
}));

describe('MediaPipeGestureDetector', () => {
  beforeEach(() => {
    LanguageManager.setLanguage('de');
  });
  it('calls onGestureDetected when a gesture message is received', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = (component as renderer.ReactTestRenderer).root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'gesture',
            gesture: 'thumbs_up',
            confidence: 0.9,
            landmarks: [[[1, 2, 3]]],
          }),
        },
      });
    });

    expect(onGestureDetected).toHaveBeenCalledWith('thumbs_up', 0.9, [[[1, 2, 3]]]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError when an error message is received', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = (component as renderer.ReactTestRenderer).root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'error', message: 'Camera access denied' }),
        },
      });
    });

    expect(onError).toHaveBeenCalledWith('Camera access denied');
    expect(onGestureDetected).not.toHaveBeenCalled();
  });

  it('calls onError when the message data is invalid JSON', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = (component as renderer.ReactTestRenderer).root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({ nativeEvent: { data: 'invalid json' } });
    });

    expect(onError).toHaveBeenCalledWith(LanguageManager.t('mediapipe.gestureProcessingError'));
    expect(onGestureDetected).not.toHaveBeenCalled();
  });

  it('passes landmarks even when no gesture is classified', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = (component as renderer.ReactTestRenderer).root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'gesture', gesture: null, confidence: 0, landmarks: [[[1, 2, 3]]] }),
        },
      });
    });

    expect(onGestureDetected).toHaveBeenCalledWith(null, 0, [[[1, 2, 3]]]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('loads MLP model on mount', async () => {
    const { getCachedMlpModel, fetchMlpModel } = require('../src/services/dgsModelClient');
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    await act(async () => {
      renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
      await Promise.resolve();
    });

    expect(getCachedMlpModel).toHaveBeenCalled();
    expect(fetchMlpModel).toHaveBeenCalled();
  });

  it('updates translations when language changes', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />,
      );
    });

    let webview = (component as renderer.ReactTestRenderer).root.findByType('mock-webview');
    expect(webview.props.source.html).toContain('Tippe, um die Kamera zu starten');

    act(() => {
      LanguageManager.setLanguage('en');
    });

    webview = (component as renderer.ReactTestRenderer).root.findByType('mock-webview');
    expect(webview.props.source.html).toContain('Tap to start camera');
  });
});
