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

2. **Open Palm**
   - Show open palm facing camera
   - Expected: Should recognize as "open_palm" with >80% confidence
   - Record: Recognition accuracy, confidence scores, response time

3. **Pointing**
   - Point index finger, other fingers closed
   - Expected: Should recognize as "point" with >80% confidence
   - Record: Recognition accuracy, confidence scores, response time

4. **Closed Fist**
   - Make closed fist
   - Expected: Should recognize as "fist" with >80% confidence
   - Record: Recognition accuracy, confidence scores, response time

## Testing Scenarios

### Confidence Threshold Testing
1. Perform each gesture with varying clarity (clear, partially occluded, fast movement)
2. Note when the UI reports low confidence and whether the MLP still produces a stable classification
3. Note when correction panel appears

### Network Variance Testing
1. Test with internet connection to allow training uploads
2. Disable internet connection and confirm gestures still classify locally
3. After reconnecting, verify queued samples sync successfully

### Performance Testing
1. Monitor WebView telemetry via `adb logcat | grep -i webview-gesture`
2. Test for 5 minutes continuously
3. Check for memory leaks or performance degradation

## Success Criteria (Baseline)
- ✅ >80% accuracy on clear gestures
- ✅ <200ms average response time for on-device classification
- ✅ No crashes during 5-minute continuous use
- ✅ Appropriate confidence indicators in UI

## Logging Commands
```bash
# Monitor gesture detector logs
adb logcat | grep -i "webview-gesture"

# Monitor performance logs
adb logcat | grep -i "telemetry"

# Save full test session log
adb logcat > test_session_$(date +%Y%m%d_%H%M%S).log
```
