# Caregiver Quick Start Guide

This guide helps caregivers get Amy's Echo running and begin supporting a child's communication in minutes.

## 1. Install the App
1. Install dependencies:
   ```bash
   npm install
   npm install --prefix app
   npm install --prefix server
   ```
2. Build the backend and download the gesture model it serves:
   ```bash
   npm run build --prefix server
   npm run download-gesture-task --prefix server
   ```
3. Start the backend server:
   ```bash
   API_TOKEN=<secret> npm start --prefix server
   ```
4. Start the app:
   ```bash
   npm run android --prefix app   # or `npm run ios --prefix app`
   ```

## 2. First Launch
1. On the device, open **Amy's Echo**.
2. Grant camera and microphone permissions when prompted.
3. Follow the onboarding steps to learn how the gesture system works.

## 3. Communicating
1. Point the camera at the child's hands.
2. The app speaks and shows a symbol when it recognizes a gesture.
3. Tap **Help Me** if the gesture was misunderstood – this stores a correction for future learning.

## 4. Teaching New Gestures
1. Open the **Admin Panel** and choose **Training**.
2. Record the child performing the new sign several times.
3. Upload the samples to the server. A personalized model is trained and downloaded automatically.

## 5. Monitoring Progress
1. From the recognition screen, tap **Analytics**.
2. The dashboard shows the recent success rate and improvement trend.
3. Use this data to decide when to practice or add new gestures.

## 6. Updating Access Tokens
1. In the **Admin Panel**, enter the OpenAI API key and backend token if required.
2. Tap **Save** for each field. Tokens are stored securely on the device.

## 7. Need Help?
If you run into problems during setup or usage, consult the [Troubleshooting Guide](Troubleshooting.md) for common fixes.

---
With these steps, caregivers can immediately begin using Amy's Echo to translate gestures into speech and track learning progress.
