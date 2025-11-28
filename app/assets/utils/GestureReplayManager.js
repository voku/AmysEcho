/**
 * Gesture Replay Manager - Amy First
 * Records and replays successful gestures in slow motion for learning
 */
export class GestureReplayManager {
    constructor() {
        this.recordings = [];
        this.MAX_RECORDINGS = 20; // Keep last 20 successful gestures
        this.currentRecording = null;
        this.recordingStartTime = 0;
        this.RECORDING_DURATION = 2000; // Record 2 seconds of gesture data
        this.activeReplay = null;
        this.replayInterval = null;
    }
    /**
     * Start recording a gesture sequence
     */
    startRecording(gesture, initialConfidence) {
        this.currentRecording = {
            gesture,
            confidence: initialConfidence,
            timestamp: Date.now(),
            landmarkSequence: [],
            handedness: [],
            metadata: {
                success: false
            }
        };
        this.recordingStartTime = Date.now();
    }
    /**
     * Add a frame to the current recording
     */
    addFrame(landmarks, handedness, confidence) {
        if (!this.currentRecording) {
            return;
        }
        const elapsed = Date.now() - this.recordingStartTime;
        if (elapsed > this.RECORDING_DURATION) {
            this.stopRecording(true, confidence);
            return;
        }
        // Convert landmarks to serializable format
        const frameLandmarks = landmarks.map(hand => hand.map(lm => [lm[0], lm[1], lm[2] || 0]));
        this.currentRecording.landmarkSequence.push(frameLandmarks);
        this.currentRecording.handedness = handedness;
        this.currentRecording.confidence = Math.max(this.currentRecording.confidence, confidence);
    }
    /**
     * Stop recording and save if successful
     */
    stopRecording(success, finalConfidence) {
        if (!this.currentRecording) {
            return null;
        }
        const recording = Object.assign(Object.assign({}, this.currentRecording), { duration: Date.now() - this.recordingStartTime, confidence: finalConfidence, metadata: Object.assign(Object.assign({}, this.currentRecording.metadata), { success }) });
        this.currentRecording = null;
        this.recordingStartTime = 0;
        if (success && recording.landmarkSequence.length >= 5) { // At least 5 frames
            this.saveRecording(recording);
            return recording;
        }
        return null;
    }
    /**
     * Save a successful recording
     */
    saveRecording(recording) {
        this.recordings.push(recording);
        // Maintain max recordings limit
        if (this.recordings.length > this.MAX_RECORDINGS) {
            this.recordings.shift();
        }
        // Send recording to React Native for persistent storage
        this.sendRecordingToReactNative(recording);
    }
    /**
     * Start replay of a gesture
     */
    startReplay(recordingId, options = {}) {
        const recording = this.recordings.find(r => r.timestamp.toString() === recordingId);
        if (!recording) {
            return false;
        }
        const defaultOptions = {
            speed: 0.5, // Half speed for learning
            loop: false,
            showLandmarks: true,
            showSkeleton: true,
            highlightKeyPoints: true
        };
        this.activeReplay = {
            recording,
            options: Object.assign(Object.assign({}, defaultOptions), options),
            currentFrame: 0,
            isPlaying: true,
            startTime: Date.now()
        };
        this.startReplayLoop();
        return true;
    }
    /**
     * Stop current replay
     */
    stopReplay() {
        if (this.replayInterval) {
            clearInterval(this.replayInterval);
            this.replayInterval = null;
        }
        this.activeReplay = null;
    }
    /**
     * Pause/resume replay
     */
    pauseReplay() {
        if (this.activeReplay) {
            this.activeReplay.isPlaying = !this.activeReplay.isPlaying;
        }
    }
    /**
     * Get current replay frame
     */
    getCurrentReplayFrame() {
        if (!this.activeReplay) {
            return null;
        }
        const { recording, currentFrame, options } = this.activeReplay;
        const progress = currentFrame / recording.landmarkSequence.length;
        return {
            frame: recording.landmarkSequence[currentFrame] || [],
            progress,
            isComplete: currentFrame >= recording.landmarkSequence.length - 1
        };
    }
    /**
     * Get available recordings for replay
     */
    getAvailableRecordings() {
        return this.recordings.map(r => ({
            id: r.timestamp.toString(),
            gesture: r.gesture,
            confidence: r.confidence,
            timestamp: r.timestamp,
            duration: r.duration,
            frameCount: r.landmarkSequence.length
        }));
    }
    /**
     * Get recording by ID
     */
    getRecording(recordingId) {
        return this.recordings.find(r => r.timestamp.toString() === recordingId) || null;
    }
    /**
     * Delete a recording
     */
    deleteRecording(recordingId) {
        const index = this.recordings.findIndex(r => r.timestamp.toString() === recordingId);
        if (index >= 0) {
            this.recordings.splice(index, 1);
            return true;
        }
        return false;
    }
    /**
     * Export recording data for external analysis
     */
    exportRecordingData(recordingId) {
        const recording = this.getRecording(recordingId);
        if (!recording) {
            return null;
        }
        return {
            gesture: recording.gesture,
            confidence: recording.confidence,
            duration: recording.duration,
            frameCount: recording.landmarkSequence.length,
            averageLandmarksPerFrame: recording.landmarkSequence.reduce((sum, frame) => sum + frame.length, 0) / recording.landmarkSequence.length,
            handedness: recording.handedness,
            metadata: recording.metadata
        };
    }
    /**
     * Get replay statistics
     */
    getReplayStats() {
        var _a;
        if (this.recordings.length === 0) {
            return {
                totalRecordings: 0,
                mostRecordedGesture: 'none',
                averageConfidence: 0,
                recentActivity: 0
            };
        }
        const gestureCounts = {};
        let totalConfidence = 0;
        let recentCount = 0;
        const oneHourAgo = Date.now() - 3600000;
        for (const recording of this.recordings) {
            gestureCounts[recording.gesture] = (gestureCounts[recording.gesture] || 0) + 1;
            totalConfidence += recording.confidence;
            if (recording.timestamp > oneHourAgo) {
                recentCount++;
            }
        }
        const mostRecordedGesture = ((_a = Object.entries(gestureCounts)
            .sort(([, a], [, b]) => b - a)[0]) === null || _a === void 0 ? void 0 : _a[0]) || 'none';
        return {
            totalRecordings: this.recordings.length,
            mostRecordedGesture,
            averageConfidence: totalConfidence / this.recordings.length,
            recentActivity: recentCount
        };
    }
    /**
     * Start the replay loop
     */
    startReplayLoop() {
        if (!this.activeReplay) {
            return;
        }
        const frameInterval = 1000 / 30 / this.activeReplay.options.speed; // 30 FPS adjusted for speed
        this.replayInterval = window.setInterval(() => {
            if (!this.activeReplay || !this.activeReplay.isPlaying) {
                return;
            }
            const { recording, currentFrame } = this.activeReplay;
            if (currentFrame >= recording.landmarkSequence.length - 1) {
                if (this.activeReplay.options.loop) {
                    this.activeReplay.currentFrame = 0;
                    this.activeReplay.startTime = Date.now();
                }
                else {
                    this.stopReplay();
                    this.sendReplayCompleteToReactNative();
                }
                return;
            }
            this.activeReplay.currentFrame++;
            // Send current frame to React Native
            this.sendReplayFrameToReactNative();
        }, frameInterval);
    }
    /**
     * Send recording to React Native for storage
     */
    sendRecordingToReactNative(recording) {
        var _a, _b;
        try {
            (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
                type: 'gesture_recording_saved',
                recording: {
                    id: recording.timestamp.toString(),
                    gesture: recording.gesture,
                    confidence: recording.confidence,
                    duration: recording.duration,
                    frameCount: recording.landmarkSequence.length
                },
                timestamp: Date.now()
            }));
        }
        catch (error) {
            console.warn('Failed to send gesture recording:', error);
        }
    }
    /**
     * Send replay frame to React Native
     */
    sendReplayFrameToReactNative() {
        var _a, _b;
        const frameData = this.getCurrentReplayFrame();
        if (!frameData || !this.activeReplay) {
            return;
        }
        try {
            (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
                type: 'gesture_replay_frame',
                frame: frameData.frame,
                progress: frameData.progress,
                gesture: this.activeReplay.recording.gesture,
                speed: this.activeReplay.options.speed,
                timestamp: Date.now()
            }));
        }
        catch (error) {
            console.warn('Failed to send replay frame:', error);
        }
    }
    /**
     * Send replay completion to React Native
     */
    sendReplayCompleteToReactNative() {
        var _a, _b;
        if (!this.activeReplay) {
            return;
        }
        try {
            (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
                type: 'gesture_replay_complete',
                gesture: this.activeReplay.recording.gesture,
                duration: Date.now() - this.activeReplay.startTime,
                timestamp: Date.now()
            }));
        }
        catch (error) {
            console.warn('Failed to send replay complete:', error);
        }
    }
    /**
     * Reset manager state
     */
    reset() {
        this.stopReplay();
        this.recordings = [];
        this.currentRecording = null;
        this.recordingStartTime = 0;
    }
    /**
     * Import recordings from React Native
     */
    importRecordings(recordings) {
        this.recordings = recordings.slice(-this.MAX_RECORDINGS);
    }
}
