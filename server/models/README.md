Place MediaPipe Tasks gesture model here as `gesture_recognizer.task`.

Options to obtain the model:
- Run: `npm run download-gesture-task --prefix server` (requires internet access)
- Or manually download from:
  https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task

At runtime, the server will auto-detect the model here, or you can set `GESTURE_TASK_PATH` to an absolute path.

