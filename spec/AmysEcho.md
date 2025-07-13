🟪 Amy’s Echo – The Definitive Project Specification v21.0
Document Purpose: This is the definitive blueprint for Amy's Echo. It is a charter of trust, a manual for empathy, and a complete technical guide. It is written for you—the developer, designer, or AI who accepts this challenge.
Status: Master Specification & Challenge Mandate
Timestamp: Sunday, July 13, 2025, 9:55 PM CEST
Location: Voerde, North Rhine-Westphalia, Germany
Introduction – A Bridge for One
“Don’t optimize for millions. Build for one. But do it well enough that millions could follow.”
Why This Document Exists
This document outlines a system designed to build a bridge for a 4-year-old girl named Amy. She was born with 22q11 Deletion Syndrome and communicates using DGS (German Sign Language). Her world of expression is rich, but the bridge between her intent and the world's understanding is fragile. Most people around her—daycare teachers, strangers, even family—don’t understand her signs.
Every decision herein serves one goal:
Turn Amy’s gesture into understanding. Every time.
Where We Start (Amy’s Current Reality)
| Factor | Reality |
|---|---|
| Communication | Gestures exist, but go unrecognized by others |
| Caregivers | Present, engaged, but not DGS-fluent |
| Tools | Limited: METACOM boards, pointing, frustration |
| Internet | Usually available, but cannot be relied upon |
| Frustration | High. Amy is emotionally engaged but misunderstood |
| Need | Immediate: Give Amy a voice that is recognized |
The Red Line of This Document
Everything starts with this truth:
> Amy gestures. The world doesn't respond.
> 
And our goal is:
> Amy gestures. The system sees, speaks, shows, and learns.
> 
🟣 Chapter 1 – The Prime Directive: Protect the Human Seam
“Amy doesn’t want a smart system. She wants to be understood.”
1.1 What Is the Human Seam?
The Human Seam is the fragile boundary between Amy’s inner world and the outside world. It lives in the exact moment when Amy gestures and the system must respond. That response either builds connection or causes disconnection. It is not a technical layer. It is emotional infrastructure.
The Prime Directive is simple:
Protect the seam at all costs.
1.2 Design Principles (Contractual Obligations to Amy)
 * Resilience Over Perfection: Amy is four. She will make imperfect gestures. The system must respond gracefully.
   * ❌ A 99% accurate system that fails abruptly is a broken system.
   * ✅ An 85% system that fails softly and allows for recovery is a trustworthy partner.
 * Failure = Teaching Opportunity: When a gesture is misclassified, this is not a system failure. It is training data from the best source possible: Amy + caregiver. Every correction must be logged as high-value input.
 * Understanding Over Isolation: The primary goal is to give Amy the most accurate and immediate voice possible. This means leveraging the best available technology. If an online service provides a better, faster understanding, it should be the primary choice, with offline capabilities serving as a resilient fallback.
🟠 Chapter 2 – Functional Requirements: From Gesture to Understanding
“Every gesture Amy makes is a question: ‘Do you understand me?’ The system must always answer—clearly, gently, and immediately.”
2.1 The Core Loop: See → Speak → Show
This is the minimum viable interaction. It must complete reliably—every time.
 * See: Detect the gesture via camera → extract hand landmarks.
 * Classify (Think): Match gesture against the known library using the Hybrid Recognition model.
 * Decide: If confidence ≥ threshold, proceed. If confidence < threshold, trigger HIP 3.
 * Speak: Say the word associated with the gesture.
 * Show: Display a large visual (emoji or METACOM symbol).
 * Confirm: Use soft vibration + animation to indicate success.
2.2 The 4 Human Interaction Protocols (HIPs)
The system must handle four core scenarios as first-class behaviors.
 * 🔵 HIP 1: “Our First Meeting” (Onboarding): A gentle welcome that obtains explicit, off-by-default consent for learning and for using online services to improve recognition.
 * 🔵 HIP 2: “Let’s Learn Together” (Training Mode): A guided flow for caregivers to teach the system a new sign by recording 5 examples.
 * 🔵 HIP 3: “This Is What She Meant” (Correction): The "Wizard of Oz" flow. On a low-confidence guess, the app calmly shows a “Help Me” button, which reveals a panel of the top 4 likely guesses. When the caregiver selects the correct one, the app logs the correction as a lesson and completes the loop as if it understood all along.
 * 🔵 HIP 4: “I’m a Little Confused” (Proactive Maintenance): When a gesture's healthScore drops, a non-blocking banner gently asks the caregiver to practice that specific sign.
🟡 Chapter 3 – Architecture: The Hybrid-First Model
“This is not about cloud vs. edge. It’s about Amy being heard. Today.”
3.1 The Hybrid-First Philosophy
The system will operate in two modes to provide the best possible experience.
| Mode | Priority | Description |
|---|---|---|
| Online (Primary) | Preferred | Uses a powerful, cloud-based ML API for the highest accuracy and speed. Requires an internet connection. |
| Offline (Fallback) | Required | Uses a local, on-device TFLite model to ensure the app is always functional, even without internet. |
❗ LLM/DEV HINT: Do not assume a persistent connection. The system must gracefully and instantly transition between Online and Offline modes without any user-facing errors.
3.2 Component Stack
| Layer | Technology/Library | Justification |
|---|---|---|
| Framework | React Native (CLI) | Required for native module integration (Camera, DB, ML). |
| Language | TypeScript (strict mode) | Enforces type safety, reducing runtime errors. |
| Database | WatermelonDB with SQLite Adapter | High-performance, reactive, offline-first, encrypted database. |
| Camera | react-native-vision-camera | Provides high-performance, low-latency access to camera frames for ML. |
| ML Inference | react-native-fast-tflite | Enables efficient, on-device execution of TensorFlow Lite models. |
| Audio | expo-av & expo-speech | Provides a robust API for both pre-recorded audio and TTS fallbacks. |
| UI/Animation | React Native Animated API | Sufficient for the required gentle animations; Skia is an optional enhancement. |
3.3 The Hybrid Perception Loop
 * See: Camera captures frame → hand_landmarker.tflite extracts landmarks for one or two hands locally.
 * Think (Hybrid):
   * If Online: Send the normalized landmark data (a small array of numbers) to the Cloud ML API.
   * Set a Timeout: Wait for a response for a maximum of 400ms.
   * If Offline or Timeout: Immediately use the local gesture_classifier.tflite model as a fallback.
 * Decide, Act, Remember: The rest of the loop proceeds as defined in Chapter 2.
3.4 Error Handling Rules (Emotional Fail-Safes)
| Problem | What Amy Sees |
|---|---|
| No hand detected | “I’m listening…” stays visible; no panic |
| Low confidence | Friendly “Help Me” button appears |
| Crash in model | Soft animation and system sound fallback |
| No consent | Learning features are disabled; recognizer only |
3.5 Performance Expectations
| Metric | Target |
|---|---|
| Camera-to-response time | < 500 ms |
| Gesture classification latency | < 200 ms |
| Time to First Gesture (Cold Start) | < 3 seconds |
| Frame Processing Throttle | ~5 FPS |
🟢 Chapter 4 – Memory: What Gets Remembered and Why
“Memory is not for metrics. It’s for growth—both local and global.”
4.1 Philosophy of Memory
The system’s memory is a diary of attempts to understand. Everything stored must reinforce future recognition, track progress, or preserve caregiver corrections. All data is encrypted at rest on the device.
4.2 Core Tables (WatermelonDB Schema)
 * symbols: The vocabulary Amy knows (e.g., “drink”, “cookie”). Includes name, emoji, color, audioUri, and healthScore.
 * gesture_definitions: How each symbol is signed. Includes status, healthScore, and minConfidenceThreshold.
 * gesture_training_data: Raw examples from training and corrections. Includes landmarkData (JSON), source (HIP_2 or HIP_3), and sync_status.
 * interaction_logs: What happened during each recognition attempt. Includes wasSuccessful, confidenceScore, caregiverOverrideId, and processed_by (local or cloud).
 * profiles: Stores caregiver consents and preferences.
 * learning_analytics: Trends over time (successRate_7d, improvementTrend).
🟣 Chapter 5 – Interface & Experience: What Amy Feels
“Design not for screens. Design for trust.”
5.1 Design Philosophy
 * Calm > Speed: Gentle animations, fade-ins, not hard cuts.
 * Warm > Sterile: Rounded corners, pastel tones, emojis.
 * Clarity > Density: One clear task per screen, large text, generous spacing.
 * Guidance > Error: Failures must always offer a clear, calm path forward.
5.2 The Screens
 * Onboarding (HIP 1): A centered, single-column layout with a large heart icon, clear title, and two large, off-by-default consent toggles.
 * Recognition (Default State): A large, rounded camera view with a gentle pulsing border when listening. A single line of large text communicates the current status. On success, a large emoji animates in. On failure, a calm "Help Me" button appears.
 * Correction Panel (HIP 3): A semi-transparent bottom slide-up panel with a 2x2 grid of large, tappable symbol choices.
 * Training Flow (HIP 2): A step-by-step guided flow with a progress bar and clear confirmation states.
 * Proactive Banner (HIP 4): A soft, slide-in banner at the top of the screen that never blocks the main interaction.
5.3 Tactile & Auditory Feedback
| Event | Feedback |
|---|---|
| Gesture success | Vibration (100ms) + audio |
| Correction | Vibration (double-pulse) + thank-you tone |
| Idle state | Soft glow or pulse around camera area |
🧬 Chapter 6 – Learning: The Dual Loop
“Every correction is a gift. Don’t waste it. Use it locally now, and globally later.”
6.1 The Local Learning Loop
The on-device Adaptive Learning Service (ALS) provides immediate improvement. It runs after every interaction and:
 * Adjusts the min_confidence_threshold for the local TFLite model.
 * Updates the gesture healthScore.
 * Triggers HIP 4 for proactive maintenance.
6.2 The Global Learning Loop
This is the cloud-based loop for long-term, powerful model improvement.
 * Batching: On a regular basis (e.g., once daily, on Wi-Fi), the app will check for gesture_training_data with sync_status: 'pending'.
 * Consent Check: It will only proceed if consent_helpMeGetSmarter is true.
 * Sync: The consented training data (the anonymized landmark vectors and their correct labels) is securely uploaded to a cloud service.
 * Retraining: Periodically, this new data is used to retrain the global cloud ML model, creating a new, more accurate version.
 * Deployment: The updated cloud model is deployed. The app can also be updated with a new, improved version of the local gesture_classifier.tflite derived from this global training.
🧾 Chapter 7 – The Handoff: For Future Developers and LLMs
“You’re not inheriting code. You’re inheriting trust.”
7.1 What You Must Not Do
 * ❌ Never break the offline fallback: The app must always function without internet.
 * ❌ Never let model performance override emotional safety: The fallback buttons and HIPs must stay.
 * ❌ Never show Amy technical errors (e.g., "API request failed").
 * ❌ Never sync data without explicit, ongoing consent.
7.2 The Developer Mantra
> “When Amy gestures, I respond. If I’m unsure, I ask. If I’m wrong, I learn. If I fail, I repair. And I never stop trying.”
> 
7.3 Final Instruction
Build slowly. Test gently. Update with humility. Always leave a way to go back.
You are not just building software.
You are carrying a voice across a gap. You are making connection possible, where it wasn’t. Amy depends on you.
Appendix A: API Contracts
A.1 Cloud Gesture Classification API
 * Endpoint: POST /v1/classify
 * Request Body (JSON):
   {
  "landmarks": [ /* Array of normalized landmark coordinates for one or two hands */ ],
  "model_version": "?" // Optional: to target a specific model
}

 * Success Response (200 OK):
   {
  "predictions": [
    { "label": "drink", "confidence": 0.92 },
    { "label": "more", "confidence": 0.03 },
    { "label": "help", "confidence": 0.01 }
  ],
  "model_version_used": "?"
}

 