# Amy's Echo: AI Implementation TODOs

This document provides a detailed, actionable checklist for implementing the core AI features of the application. It is designed to be the single source of truth for an LLM developer, covering both client-side and server-side responsibilities.

**Architectural Mandate**:
1.  **Gesture Recognition**: All real-time gesture processing must occur **on-device** for performance and privacy.
2.  **Dialog Engine & Model Training**: All communication with the LLM and all personalized model training must be handled by a **secure cloud-based server**. The client application will never handle API keys.

---

## **Part 1: On-Device Gesture Recognition & Personalization**

### **TODO 1.1: Implement Baseline Real-Time Gesture Recognition**

* **Objective**: To get the live camera feed running through the two-stage (landmark + classification) TFLite pipeline.
* **File**: `screens/LearningScreen.tsx`
* **Action**:
    1.  **Acquire Models**: Download the `hand_landmarker.tflite` and `gesture_classifier.tflite` models from Google MediaPipe and place them in `assets/models/`.
    2.  **Load Models**: In the `LearningScreen` component, use the `useTensorflowModel` hook to load both models into memory.
    3.  **Implement Frame Processor**: Create the `useFrameProcessor` worklet.
        * **LLM Hint**: The logic inside this worklet is critical. It must first pass the camera `frame` to the `hand_landmarker.tflite` model. If landmarks are detected, the output of that model (the landmark coordinates) must then be passed as the input to the `gesture_classifier.tflite` model.
        * **Code Snippet (Conceptual)**:
            ```typescript
            const frameProcessor = useFrameProcessor((frame) => {
              'worklet';
              if (!landmarkModel.value || !gestureModel.value) return;

              // Stage 1: Detect Hand Landmarks
              const landmarkResults = landmarkModel.value.runSync([frame]);
              const landmarks = landmarkResults[0]; // Placeholder for actual data extraction

              if (landmarks && landmarks.length > 0) {
                // Stage 2: Classify Gesture from Landmarks
                const gestureResults = gestureModel.value.runSync([landmarks]);
                const predictions = gestureResults[0];
                // ...process predictions and update UI via runOnJS...
              }
            }, [landmarkModel, gestureModel]);
            ```

### **TODO 1.2: Implement In-App Data Collection for Personalization**

* **Objective**: To build the UI and logic for a caregiver to record samples of Amy's specific gestures.
* **File**: `screens/TrainingScreen.tsx`
* **Action**:
    1.  **Build UI**: Create a guided UI that receives a `symbol` to be trained, shows a camera view, and has a "Record" button with a progress indicator (e.g., "Sample 1 of 5").
    2.  **Implement Video Processing**: When a 3-second video is recorded, **do not save the video file**. Instead, create a service function that uses a library like `react-native-ffmpeg` to extract image frames from the temporary video file.
    3.  **Extract and Save Landmarks**: For each extracted frame, use the `hand_landmarker.tflite` model to extract the hand keypoints. Aggregate these landmark sequences and, upon caregiver confirmation, serialize the data to a JSON string and save it to the `gesture_training_data` table in the local WatermelonDB.

---

## **Part 2: Cloud-Based AI Server**

**LLM Hint**: These tasks require creating a new server-side application (e.g., using Python with Flask/FastAPI and TensorFlow/Keras).

### **TODO 2.1: Create Secure LLM Dialog Endpoint**

* **Objective**: To create a secure backend proxy that handles all communication with the OpenAI API.
* **Endpoint**: `POST /generate-suggestions`
* **Server-Side Logic**:
    1.  The endpoint must require a user authentication token (JWT) in the request header.
    2.  It will hold the secret OpenAI API key securely in its environment variables.
    3.  It will receive context from the app (e.g., selected symbol, user age).
    4.  **Crucially**, it must construct a prompt that explicitly instructs the OpenAI model to return a valid JSON object using `response_format: { "type": "json_object" }`.
    5.  It will then call the OpenAI API and stream the response back to the client for the best user experience.

### **TODO 2.2: Create Personalized Model Training Endpoint**

* **Objective**: To receive collected gesture data, train a new model, and make it available for download.
* **Endpoint 1**: `POST /train-model`
    * **Logic**: This endpoint receives the JSON payload of landmark data from the app. It should trigger a background job to run a Python training script.
* **Python Training Script (`train.py`)**:
    * **LLM Hint**: The core of this script is a Keras model. An **LSTM (Long Short-Term Memory)** network is the correct architecture for classifying sequence data like gesture landmarks.
    * **Steps**:
        1.  Load and preprocess the landmark data (normalize coordinates, pad sequences).
        2.  Define and compile the Keras LSTM model.
        3.  Train the model using `model.fit()`.
        4.  Convert the trained Keras model to the `.tflite` format.
        5.  Save the new model file (e.g., `amy_model_v2.tflite`) to a cloud storage bucket or a publicly accessible folder.
* **Endpoint 2**: `GET /latest-model?profileId=amy`
    * **Logic**: This endpoint allows the app to check for and download the latest successfully trained `.tflite` model for a specific user.

---

## **Part 3: Closing the Loop - Deploying AI Features**

### **TODO 3.1: Integrate LLM Dialog Engine in the App**

* **Objective**: To call the secure server endpoint and display the AI-powered suggestions.
* **File**: `services/dialogEngine.ts` & `screens/LearningScreen.tsx`
* **Action**:
    1.  In `dialogEngine.ts`, replace the placeholder `getLLMSuggestions` with a `fetch` call to your new `POST /generate-suggestions` server endpoint, including the user's auth token.
    2.  In `LearningScreen.tsx`, use the `suggestionStatus` state machine (as defined in our previous patches) to handle the loading, success, and error states of the API call and render the returned suggestions.

### **TODO 3.2: Implement Personalized Model Activation**

* **Objective**: To allow the app to download and use Amy's personalized gesture model.
* **File**: `screens/AdminScreen.tsx` & `screens/LearningScreen.tsx`
* **Action**:
    1.  In the `AdminScreen`, add a "Download Latest Personalized Model" button that calls the `GET /latest-model` endpoint.
    2.  Use a library like `expo-file-system` to download and save the `.tflite` file to the app's private document directory. Store the local file URI (`file://...`) securely, associated with Amy's profile.
    3.  In `LearningScreen.tsx`, modify the `useTensorflowModel` hook for the gesture classifier. It should check if a personalized model URI exists for the current profile. If yes, load that model; if no, fall back to the default bundled model.

