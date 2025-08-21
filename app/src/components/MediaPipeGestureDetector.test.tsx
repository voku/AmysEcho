import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MediaPipeGestureDetector } from './MediaPipeGestureDetector';

// Mock the WebView component
jest.mock('react-native-webview', () => ({
  WebView: (props: any) => {
    return <mock-WebView {...props} />;
  },
}));

describe('MediaPipeGestureDetector', () => {
  it('calls onGestureDetected when a gesture message is received', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    const { getByTestId } = render(
      <MediaPipeGestureDetector
        onGestureDetected={onGestureDetected}
        onError={onError}
      />
    );

    const webview = getByTestId('mock-WebView');

    const gestureData = {
      type: 'gesture',
      gesture: 'thumbs_up',
      confidence: 0.9,
      landmarks: [[1, 2, 3]],
    };

    fireEvent(webview, 'message', { nativeEvent: { data: JSON.stringify(gestureData) } });

    expect(onGestureDetected).toHaveBeenCalledWith('thumbs_up', 0.9, [[1, 2, 3]]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError when an error message is received', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    const { getByTestId } = render(
      <MediaPipeGestureDetector
        onGestureDetected={onGestureDetected}
        onError={onError}
      />
    );

    const webview = getByTestId('mock-WebView');

    const errorData = {
      type: 'error',
      message: 'Camera access denied',
    };

    fireEvent(webview, 'message', { nativeEvent: { data: JSON.stringify(errorData) } });

    expect(onError).toHaveBeenCalledWith('Camera access denied');
    expect(onGestureDetected).not.toHaveBeenCalled();
  });

  it('calls onError when the message data is invalid JSON', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    const { getByTestId } = render(
      <MediaPipeGestureDetector
        onGestureDetected={onGestureDetected}
        onError={onError}
      />
    );

    const webview = getByTestId('mock-WebView');

    fireEvent(webview, 'message', { nativeEvent: { data: 'invalid json' } });

    expect(onError).toHaveBeenCalledWith('Failed to parse gesture data');
    expect(onGestureDetected).not.toHaveBeenCalled();
  });
});
