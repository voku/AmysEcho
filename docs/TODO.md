# Amy's Echo: AI Implementation TODOs

This document provides a detailed, actionable checklist for implementing the core AI features of the application. It is designed to be the single source of truth for an LLM developer, covering both client-side and server-side responsibilities.

**Architectural Mandate**:
1.  **Gesture Recognition**: All real-time gesture processing must occur **on-device** for performance and privacy.
2.  **Dialog Engine**: The app communicates directly with OpenAI using an API key stored in secure device storage. **Model Training** still happens on a secure cloud server.

---

## **Part 1: On-Device Gesture Recognition & Personalization**

### **TODO 1.1: Implement Baseline Real-Time Gesture Recognition**

* **Objective**: To get the live camera feed running through the two-stage (landmark + classification) TFLite pipeline.
* **File**: `src/screens/RecognitionScreen.tsx`
* **Status**: **Completed** via the new `mlService` and worklet frame processor.
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

### **TODO 1.2: In-App Data Collection for Personalization**

* **Objective**: To build the UI and logic for a caregiver to record samples of Amy's specific gestures.
* **File**: `src/screens/TrainingScreen.tsx`
* **Status**: Completed. The UI is built, video processing extracts landmarks, and data is saved to WatermelonDB.

---

## **Part 2: Server-Side Model Training**

**LLM Hint**: These tasks require creating a server-side application (e.g., using Python with Flask/FastAPI and TensorFlow/Keras) to handle heavy model training workloads.

### **TODO 2.1: OpenAI Dialog API Integration**

* **Objective**: Use an API key stored on the device to request suggestions directly from OpenAI.
* **File**: `services/dialogEngine.ts` & `src/screens/AdminScreen.tsx`
* **Status**: Completed. Admin screen allows saving the OpenAI key, and `dialogEngine.ts` uses it to call the OpenAI API.

### **TODO 2.2: Personalized Model Training Endpoint**

* **Objective**: To receive collected gesture data, train a new model, and make it available for download.
* **Status**: Completed. The `/train-model` endpoint triggers `train.py` to train an LSTM model and save it as `trained_model.tflite`. The `/latest-model` endpoint serves this file.

---

## **Part 3: Closing the Loop - Deploying AI Features**

### **TODO 3.1: Integrate LLM Dialog Engine in the App**

* **Objective**: To fetch suggestions from OpenAI and display them in the UI.
* **File**: `services/dialogEngine.ts` & `src/screens/RecognitionScreen.tsx`
* **Status**: Completed. `RecognitionScreen.tsx` calls `getLLMSuggestions` from `dialogService.ts` and displays the results.

### **TODO 3.2: Implement Personalized Model Activation** *(Completed)*

* **Objective**: To allow the app to download and use Amy's personalized gesture model.
* **File**: `src/screens/AdminScreen.tsx` & `src/screens/RecognitionScreen.tsx`
* **Action**:
    1.  In the `AdminScreen`, add a "Download Latest Personalized Model" button that calls the `GET /latest-model` endpoint.
    2.  Use a library like `expo-file-system` to download and save the `.tflite` file to the app's private document directory. Store the local file URI (`file://...`) securely, associated with Amy's profile.
    3.  In `RecognitionScreen.tsx`, modify the `useTensorflowModel` hook for the gesture classifier. It should check if a personalized model URI exists for the current profile. If yes, load that model; if no, fall back to the default bundled model.

---

## **Part 4: Continuous Improvement & Data Sync**

### **TODO 4.1: Log Caregiver Corrections**

* **Objective**: Store each correction made by a caregiver for future training.
* **File**: `db/models.ts`, `db/schema.ts`, `src/screens/RecognitionScreen.tsx`
* **Status**: **Completed**. Corrections are saved in the `corrections` table.

### **TODO 4.2: Sync Corrections and Check Model Updates**

* **Objective**: Upload unsynced correction data and download new personalized models when available.
* **File**: `src/services/syncService.ts` & `src/context/AppServicesProvider.tsx`
* **Status**: **Completed**. The sync service runs on app launch.

### **TODO 4.3: Add DGS Video Player**

* **Objective**: Show reference DGS clips for each gesture to aid learning.
* **File**: `src/components/DgsVideoPlayer.tsx` & `src/screens/LearningScreen.tsx`
* **Status**: Completed.

### **TODO 4.4: Create TeachingScreen for HIP 2**

* **Objective**: Allow caregivers to teach the system new gestures directly on the device.
* **File**: `src/screens/TeachingScreen.tsx`
* **Status**: Completed.

---

## **Part 5: Future Enhancements**

### **TODO 5.1: Implement Multi-Profile Management**

* **Objective**: Support multiple child profiles with separate preferences and vocabulary sets.
* **File**: `src/screens/ProfileManagerScreen.tsx`, `db/models.ts`
* **Status**: Completed.

### **TODO 5.2: Expand Analytics Dashboard**

* **Objective**: Visualize learning trends and sync analytics to the server for caregiver review.
* **File**: `src/screens/DashboardScreen.tsx`, `server/src/services/analyticsService.ts`
* **Status**: Completed.

### **TODO 5.3: Build Caregiver Web Portal**

* **Objective**: Provide a web interface to manage training data, view analytics, and download personalized models.
* **File**: `server/src/portal/`
* **Status**: Planned.

### **TODO 5.4: Add Custom Audio Recording**

* **Objective**: Allow caregivers to record personalized audio cues for each symbol.
* **File**: `src/screens/AdminScreen.tsx`, `src/services/audioService.ts`
* **Status**: Planned.
