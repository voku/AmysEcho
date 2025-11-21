import React, { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import CameraView from 'expo-camera/build/CameraView';
import { logger } from '../utils/logger';

export interface ExpoVideoRecorderHandle {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string>; // Returns video URI
  isRecording: () => boolean;
}

interface Props {
  facingMode: 'user' | 'environment';
  onRecordingStart?: () => void;
  onRecordingStop?: (uri: string) => void;
  onError?: (error: Error) => void;
}

export const ExpoVideoRecorder = forwardRef<ExpoVideoRecorderHandle, Props>(
  ({ facingMode, onRecordingStart, onRecordingStop, onError }, ref) => {
    const cameraRef = useRef<CameraView>(null);
    const [isRecording, setIsRecording] = useState(false);
    const recordingPromiseRef = useRef<Promise<{ uri: string } | undefined> | null>(null);

    const startRecording = useCallback(async () => {
      if (!cameraRef.current || isRecording) {
        return;
      }

      try {
        setIsRecording(true);
        logger.info('Starting expo-camera video recording');
        
        // Start recording - this returns a promise that resolves when stopped
        const recordPromise = cameraRef.current.recordAsync({
          maxDuration: 30, // 30 seconds max
        });
        
        recordingPromiseRef.current = recordPromise;
        onRecordingStart?.();
      } catch (error) {
        logger.error('Failed to start expo-camera recording', error);
        setIsRecording(false);
        recordingPromiseRef.current = null;
        const err = error instanceof Error ? error : new Error(String(error));
        onError?.(err);
        throw err;
      }
    }, [isRecording, onRecordingStart, onError]);

    const stopRecording = useCallback(async (): Promise<string> => {
      if (!cameraRef.current || !isRecording || !recordingPromiseRef.current) {
        throw new Error('No recording in progress');
      }

      try {
        logger.info('Stopping expo-camera video recording');
        cameraRef.current.stopRecording();
        
        // Wait for the recording promise to resolve
        const video = await recordingPromiseRef.current;
        if (!video || !video.uri) {
          throw new Error('Recording failed: no video URI returned');
        }
        const uri = video.uri;
        
        logger.info('expo-camera recording completed', { uri });
        setIsRecording(false);
        recordingPromiseRef.current = null;
        onRecordingStop?.(uri);
        
        return uri;
      } catch (error) {
        logger.error('Failed to stop expo-camera recording', error);
        setIsRecording(false);
        recordingPromiseRef.current = null;
        const err = error instanceof Error ? error : new Error(String(error));
        onError?.(err);
        throw err;
      }
    }, [isRecording, onRecordingStop, onError]);

    const checkIsRecording = useCallback(() => {
      return isRecording;
    }, [isRecording]);

    useImperativeHandle(ref, () => ({
      startRecording,
      stopRecording,
      isRecording: checkIsRecording,
    }));

    const cameraFacing = facingMode === 'user' ? 'front' : 'back';

    return (
      <View style={StyleSheet.absoluteFill}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={cameraFacing}
          mode="video"
        />
      </View>
    );
  }
);

ExpoVideoRecorder.displayName = 'ExpoVideoRecorder';
