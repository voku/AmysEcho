# Amy's Echo: Unified AI Implementation Blueprint

**Document Purpose**: This is the master technical blueprint for implementing the critical AI features of the Amy's Echo application. It provides a holistic, end-to-end plan covering both the on-device client application and the cloud-based server components. This document is designed to be the single source of truth for any developer or AI agent working on these features.

**Executive Summary**: This blueprint establishes distinct architectural mandates for the two core AI features.
1.  **Gesture Recognition**: An on-device, real-time processing pipeline is mandated for performance and privacy. This involves a two-stage model (landmark detection followed by classification) and a feedback loop for personalization.
2.  **Dialog Engine**: The app stores an OpenAI API key in secure storage and calls the Chat Completions API directly. **Model Training** still relies on a cloud server for heavy computation.

This document details the specific libraries, implementation patterns, and the interconnected workflow required to build this system.

---

## **Part I: On-Device AI — Gesture Recognition & Data Collection**

**Objective**: To build a high-performance, on-device system that can both recognize gestures in real-time and collect high-quality data for personalized model training.

### **Section 1: High-Performance Architectural Framework**

The viability of this feature hinges on a modern React Native architecture that avoids the legacy bridge.

* **Core Technology**:
    * `react-native-vision-camera`: For high-performance camera access and its critical "Frame Processor" feature.
    * `react-native-fast-tflite`: For zero-copy, JSI-powered inference with TensorFlow Lite models.
* **The JSI/Worklet Imperative**: All processing must occur within the `useFrameProcessor` worklet to prevent blocking the UI thread. This architecture allows for synchronous, low-latency communication between JavaScript and native code, which is essential for real-time performance.

### **Section 2: Implementation of the Real-Time Recognition Pipeline**

This is the baseline gesture recognition that runs with pre-trained models.

* **TODO 2.1: Acquire Pre-trained Models**
    1.  **Hand Landmark Model**: Download the `hand_landmarker.task` model from [Google MediaPipe](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker/index). Rename it to `hand_landmarker.tflite`.
    2.  **Gesture Classification Model**: Download the `gesture_recognizer.task` model from [Google MediaPipe](https://developers.google.com/mediapipe/solutions/vision/gesture_recognizer/index). Rename it to `gesture_classifier.tflite`.
    3.  **Placement**: Place both files in the app's `assets/models/` directory.

* **TODO 2.2: Implement the Two-Stage Frame Processor**
    * **File**: `screens/LearningScreen.tsx` (or a dedicated component).
    * **Instruction**: Implement the `useFrameProcessor` hook to orchestrate the two models.
    * **LLM Hint**: This is the most complex client-side logic. Ensure both models are loaded with `useTensorflowModel` before processing. The output of the landmark model becomes the input for the gesture model.

    * **Code Example (`useFrameProcessor` logic)**:
        ```typescript
        const landmarkModel = useTensorflowModel(require('../assets/models/hand_landmarker.tflite'));
        const gestureModel = useTensorflowModel(require('../assets/models/gesture_classifier.tflite'));

        const frameProcessor = useFrameProcessor((frame: Frame) => {
          'worklet';
          if (!landmarkModel.value || !gestureModel.value) return;

          try {
            // Stage 1: Detect Hand Landmarks from the camera frame.
            // Note: Preprocessing the 'frame' object into a tensor may be required.
            const landmarkResults = landmarkModel.value.runSync([frame]);
            const landmarks = landmarkResults[0]; // Placeholder for actual landmark data

            if (!landmarks || landmarks.length === 0) {
              // No hand detected, clear any previous gesture state
              runOnJS(setGesture)(null);
              return;
            }

            // Stage 2: Classify Gesture from the detected landmarks.
            const gestureResults = gestureModel.value.runSync([landmarks]);
            const predictions = gestureResults[0] as Float32Array;

            // Post-process results and update UI
            // ... (find max confidence, map to label, etc.) ...
            
          } catch (e) {
            console.error(e);
          }
        }, [landmarkModel, gestureModel]);
        ```

### **Section 3: TODO — Implementing Personalized Data Collection**

This is the critical client-side component for teaching the app Amy's specific gestures.

* **TODO 3.1: Build the `TrainingScreen.tsx` UI**
    * **Instruction**: Implement a guided, multi-step UI for recording gesture samples.
    * **UI Flow**:
        1.  **Selection**: Screen receives a `symbol` to train.
        2.  **Recording**: A camera view with a "Record" button and progress indicator (e.g., "Sample 1 of 5").
        3.  **Capture**: Record a 3-second video clip into a temporary file using `camera.startRecording()`.
        4.  **Review**: Show thumbnails of recorded samples with an option to delete and re-record.
        5.  **Save**: A "Save Training Data" button, enabled after collecting enough samples.

* **TODO 3.2: Implement In-Memory Landmark Extraction**
    * **Instruction**: After a video is recorded, process it to extract and save only the landmark data, not the video file itself.
    * **LLM Hint**: This requires a library like `react-native-ffmpeg` to extract individual frames from the temporary video file.
    * **Workflow**:
        1.  Pass the temporary `videoPath` to a new service function.
        2.  Inside the function, use the frame extraction library to get image frames.
        3.  For each frame, use the **`hand_landmarker.tflite`** model (already loaded) to extract the 21 hand keypoints.
        4.  Aggregate the landmark sequences for all frames.
        5.  When the caregiver clicks "Save," serialize this array of landmark data to a JSON string and save it to the `gesture_training_data` table in WatermelonDB, linked to the correct symbol.
        6.  Delete the temporary video file.

---

## **Part II: Cloud-Powered AI — Dialog & Model Training**

**Objective**: To provide intelligent dialog suggestions and handle the computationally intensive task of personalized model training.

### **Section 4: API Access & Security**

* **OpenAI Key Storage**: The mobile app stores the API key using `expo-secure-store` and calls the Chat Completions API directly.
* **Server Responsibility**: The backend focuses on training new gesture models and serving them for download.

### **Section 5: TODO — Implementing the Server-Side Components**

This involves setting up a server application (e.g., using Python with Flask or FastAPI).

* **TODO 5.1: [Deprecated]**
    * The dialog engine now calls OpenAI directly from the app, so this endpoint is no longer required.

* **TODO 5.2: Create the Model Training Endpoint & Script** *(Completed)*
    * **Endpoint**: `POST /train-model`
    * **Logic**:
        1.  Receives the JSON payload of landmark data collected from the app.
        2.  Saves the data and triggers a background training job.
    * **Training Script (`train.py`)**:
        * **Instruction**: This Python script will use TensorFlow/Keras to train a new gesture classifier.
        * **LLM Hint**: Use an LSTM (Long Short-Term Memory) model architecture, as it is highly effective for sequence data like gesture landmarks.
        * **Code Example (Keras Model Definition)**:
            ```python
            import tensorflow as tf
            from tensorflow import keras

            model = keras.Sequential([
                # Input shape is (sequence_length, num_features)
                keras.layers.LSTM(32, return_sequences=True, input_shape=(30, 63)),
                keras.layers.LSTM(32),
                keras.layers.Dense(16, activation='relu'),
                keras.layers.Dropout(0.5),
                keras.layers.Dense(num_unique_gestures, activation='softmax')
            ])
            model.compile(optimizer='adam', loss='sparse_categorical_crossentropy', metrics=['accuracy'])
            ```
        * After training with `model.fit()`, the script must convert the model to the `.tflite` format and save it with a versioned name (e.g., `amy_model_v2.tflite`).

---

## **Part III: Closing the Loop — Personalized Deployment**

**Objective**: To create the feedback loop where the newly trained personalized model is deployed back to Amy's device.

### **Section 6: TODO — Implementing Model Deployment in the App**

* **TODO 6.1: Create a Model Download Endpoint on the Server** *(Completed)*
    * **Endpoint**: `GET /latest-model?profileId=amy`
    * **Logic**: This endpoint checks for the latest successfully trained model for the given profile and allows it to be downloaded.

* **TODO 6.2: Implement Model Download and Activation in the App**
    * **File**: `screens/AdminScreen.tsx`
    * **Instruction**: Add a "Download Latest Personalized Model" button.
    * **LLM Hint**: Use `expo-file-system` to download the `.tflite` file from the server endpoint and save it to the app's persistent document directory.
    * Store the local file URI (`file://...`) securely, associated with Amy's profile.

* **TODO 6.3: Activate the Personalized Model**
    * **File**: `screens/LearningScreen.tsx`
    * **Instruction**: Modify the component's logic to be "custom-model-aware."
    * **Workflow**:
        1.  When the screen loads, check if a local model URI exists for the current profile.
        2.  If **yes**, pass that URI to the `useTensorflowModel` hook for the gesture classifier.
        3.  If **no**, fall back to loading the default, bundled `gesture_classifier.tflite`.
    * The `useFrameProcessor` will now seamlessly use Amy's personalized model if it's available, resulting in higher accuracy for her specific gestures.
