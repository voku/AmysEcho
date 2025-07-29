# User Stories and Screen Flows

This document outlines the main user stories for Amy's Echo and how the screens in `app/src/screens` connect to fulfil them. Each section highlights an existing workflow in the current codebase.

## 1. Onboarding & Profile Creation (HIP&nbsp;1)
- **Story**: As a caregiver, I want to set up Amy's profile and preferences the first time we open the app.
- **Flow**:
  1. Launching the app shows **Onboarding**.
  2. The caregiver enters a name, chooses a vocabulary set and toggles consent options.
  3. After confirming, the app navigates to **ProfileManager** where the new profile is stored.

## 2. Selecting a Profile
- **Story**: As Amy or her caregiver, I want to choose who is using the app.
- **Flow**:
  1. From **ProfileManager** or **ProfileSelect**, tap an existing profile.
  2. The profile's accessibility settings are loaded and the app navigates to **Recognition**.
  3. Additional options allow navigating to **Admin** or creating a new profile.

## 3. Amy Communicates a Sign
- **Story**: As Amy, I want my gesture to be recognised quickly so I can express myself.
- **Flow**:
  1. **Recognition** opens with the camera active.
  2. When a sign is detected, the matching symbol and audio are shown.
  3. If the confidence is low, a caregiver taps **Help Me** to reveal the **Correction** panel. The legacy `CorrectionScreen` is accessible from the Admin menu.

## 4. Caregiver Fixes a Misunderstanding (HIP&nbsp;3)
- **Story**: As a caregiver, I want to correct the app when it guesses wrong.
- **Flow**:
  1. In **Recognition**, the **Help Me** button opens the correction panel with four symbol choices.
  2. Selecting the correct symbol logs a correction sample for later training.
  3. The Admin menu also links to the standalone **Correction** screen used in early versions.

## 5. Caregiver Teaches a New Sign (HIP&nbsp;2)
- **Story**: As a caregiver, I want to record samples so the app learns a new gesture.
- **Flow**:
  1. From **Admin**, choose **Training** for the guided flow or **LegacyTraining** for the older interface.
  2. Five examples are recorded with the camera and saved as training data.
  3. After completion, the caregiver returns to **Admin** or **Recognition**.

## 6. Proactive Maintenance (HIP&nbsp;4)
- **Story**: As Amy's gestures drift over time, I want the app to gently ask for practice when accuracy drops.
- **Flow**:
  1. If a gesture's health score is low, a non-blocking banner appears in **Learning**.
  2. Tapping **Üben** (Practice) navigates directly to the **Training** flow.

## 7. Reviewing Progress
- **Story**: As a caregiver, I want to see analytics about Amy's learning progress.
- **Flow**:
  1. From **Recognition** or **Admin**, open **Dashboard** to view success rates and trends.
  2. Analytics are loaded from local storage and uploaded to the server when online.

## Screen Linking Overview
- `App.tsx` registers routes for all screens, including **LegacyTraining** and **Correction**.
- `AdminScreen` provides buttons to reach **Training**, **LegacyTraining**, **Correction**, and **Dashboard** alongside other admin tools.
- `RecognitionScreen` has a **Menu** button that opens **ProfileSelect** for switching profiles or entering the parent/admin areas.
