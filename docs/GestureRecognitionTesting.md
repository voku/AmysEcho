# Gesture Recognition Testing Protocol

## Setup
1. Install the app on an Android device: `npx expo run:android`
2. Ensure good lighting and clear background
3. Enable developer options and USB debugging
4. Connect device to computer for log monitoring

## Test Gestures
Test each of these gestures 10 times and record results:

1. **Thumbs Up**
   - Hold thumb up, other fingers closed
   - Expected: Should recognize as "thumbs_up" with >80% confidence
   - Record: Recognition accuracy, confidence scores, response time

2. **Open Palm (Stop)**
   - Show open palm facing camera
   - Expected: Should recognize as "stop" with >80% confidence
   - Record: Recognition accuracy, confidence scores, response time

3. **Pointing**
   - Point index finger, other fingers closed
   - Expected: Should recognize as "point" with >80% confidence
   - Record: Recognition accuracy, confidence scores, response time

4. **Peace Sign**
   - Show peace sign (V with index and middle finger)
   - Expected: Should recognize as "peace" with >80% confidence
   - Record: Recognition accuracy, confidence scores, response time

5. **Closed Fist**
   - Make closed fist
   - Expected: Should recognize as "fist" with >80% confidence
   - Record: Recognition accuracy, confidence scores, response time

## Testing Scenarios

### Confidence Threshold Testing
1. Perform each gesture with varying clarity (clear, partially occluded, fast movement)
2. Note when the system triggers cloud fallback
3. Note when correction panel appears

### Hybrid System Testing
1. Test with internet connection (should use cloud fallback when needed)
2. Test without internet (should work with local-only)
3. Verify response times for both modes

### Performance Testing
1. Monitor frame processing time via `adb logcat | grep GestureClassifier`
2. Test for 5 minutes continuously
3. Check for memory leaks or performance degradation

## Success Criteria (Baseline)
- ✅ >80% accuracy on clear gestures
- ✅ <200ms average response time for local recognition
- ✅ <2s response time for cloud fallback
- ✅ No crashes during 5-minute continuous use
- ✅ Appropriate confidence indicators in UI

## Logging Commands
```bash
# Monitor gesture classification logs
adb logcat | grep -E "(GestureClassifier|Recognition)"

# Monitor performance logs
adb logcat | grep -E "(Performance|Latency)"

# Save full test session log
adb logcat > test_session_$(date +%Y%m%d_%H%M%S).log
```
