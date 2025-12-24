import AdmZip from 'adm-zip';

const metadata = {
  label: "REAL_TEST_GESTURE",
  profileId: "real-user-456",
  capturedAt: new Date().toISOString()
};

const landmarks = {
  frames: [
    {
      landmarks: Array(2).fill(0).map(() => Array(21).fill(0).map(() => [Math.random(), Math.random(), 0])),
      poseLandmarks: [[0.5, 0.5, 0, 0.9]],
      faceLandmarks: [[0.3, 0.3, 0]]
    },
    {
      landmarks: Array(2).fill(0).map(() => Array(21).fill(0).map(() => [Math.random(), Math.random(), 0])),
      poseLandmarks: [[0.51, 0.51, 0, 0.8]],
      faceLandmarks: [[0.31, 0.31, 0]]
    }
  ],
  metadata: {
    modalities: {
      hands: { present: true, frameCount: 2, coverage: 1.0 },
      pose: { present: true, frameCount: 2, coverage: 1.0 },
      face: { present: true, frameCount: 2, coverage: 1.0 }
    }
  }
};

const zip = new AdmZip();
zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata, null, 2)));
zip.addFile('landmarks.json', Buffer.from(JSON.stringify(landmarks, null, 2)));
zip.writeZip('real-test-bundle.zip');
console.log('Created real-test-bundle.zip');