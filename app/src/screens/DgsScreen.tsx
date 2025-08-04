import React, { useState } from 'react';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Button, StyleSheet, Text, View, Switch } from 'react-native';

export default function DgsScreen() {
  const [useVideo, setUseVideo] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  // Function to handle the toggle switch
  const handleToggle = () => {
    if (!useVideo) { // If turning the camera ON
      if (permission && permission.granted) {
        setUseVideo(true);
      } else {
        // Request permission if not already granted
        requestPermission().then((response: { granted: boolean }) => {
          if(response.granted) {
            setUseVideo(true);
          } else {
            // Let the user know why they can't use the feature
            alert("You must grant camera permission to use DGS video.");
          }
        });
      }
    } else { // If turning the camera OFF
      setUseVideo(false);
    }
  };

  if (!permission) {
    // Camera permissions are still loading, show a blank screen or a loader
    return <View />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.controls}>
        <Text>Show DGS Video</Text>
        <Switch value={useVideo} onValueChange={handleToggle} />
      </View>

      {useVideo ? (
        <CameraView style={styles.camera} facing={'front'}>
          <View style={styles.buttonContainer}>
            {/* You can add a record button here in the future */}
          </View>
        </CameraView>
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>I'm listening...</Text>
          {/* You can add your "SIMULATE" buttons here */}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  camera: {
    flex: 1,
  },
  buttonContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'transparent',
    margin: 64,
  },
});