import AdmZip from 'adm-zip';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Create output directory if it doesn't exist
const outputDir = 'test-bundles';
try {
  mkdirSync(outputDir, { recursive: true });
} catch (err) {
  if (err.code !== 'EEXIST') throw err;
}

// Create multiple test bundles with different scenarios

// Bundle 1: Realistic multimodal gesture with temporal variation
const multimodalGesture = {
  label: "HELLO",
  profileId: "test-profile-multimodal",
  capturedAt: new Date().toISOString()
};

const multimodalLandmarks = {
  frames: [
    // Frame 1: Hand raised, facing forward
    {
      landmarks: Array(2).fill(0).map(() => Array(21).fill(0).map(() => 
        [0.4 + Math.random() * 0.2, 0.3 + Math.random() * 0.2, Math.random() * 0.1 - 0.05]
      )),
      poseLandmarks: [[0.5, 0.3, 0, 0.95], [0.5, 0.5, 0, 0.95]], // Shoulders, hips
      faceLandmarks: Array(10).fill(0).map(() => [0.4 + Math.random() * 0.2, 0.3 + Math.random() * 0.2, 0])
    },
    // Frame 2: Hand lowered slightly
    {
      landmarks: Array(2).fill(0).map(() => Array(21).fill(0).map(() => 
        [0.4 + Math.random() * 0.2, 0.5 + Math.random() * 0.2, Math.random() * 0.1 - 0.05]
      )),
      poseLandmarks: [[0.5, 0.35, 0, 0.93], [0.5, 0.5, 0, 0.93]],
      faceLandmarks: Array(10).fill(0).map(() => [0.4 + Math.random() * 0.2, 0.35 + Math.random() * 0.2, 0])
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

// Bundle 2: Hands-only gesture (fallback test)
const handsOnlyGesture = {
  label: "THANK_YOU",
  profileId: "test-profile-hands",
  capturedAt: new Date().toISOString()
};

const handsOnlyLandmarks = {
  frames: [
    {
      landmarks: Array(2).fill(0).map(() => Array(21).fill(0).map(() => 
        [0.6 + Math.random() * 0.3, 0.4 + Math.random() * 0.3, Math.random() * 0.15 - 0.075]
      ))
    },
    {
      landmarks: Array(2).fill(0).map(() => Array(21).fill(0).map(() => 
        [0.6 + Math.random() * 0.3, 0.2 + Math.random() * 0.3, Math.random() * 0.15 - 0.075]
      ))
    }
  ]
};

// Bundle 3: Complex multimodal with more frames
const complexGesture = {
  label: "PLEASE",
  profileId: "test-profile-complex",
  capturedAt: new Date().toISOString()
};

const complexLandmarks = {
  frames: Array(5).fill(0).map((_, frameIndex) => ({
    landmarks: Array(2).fill(0).map(() => Array(21).fill(0).map(() => [
      0.3 + Math.sin(frameIndex * 0.5) * 0.2,
      0.3 + Math.cos(frameIndex * 0.3) * 0.2, 
      Math.sin(frameIndex * 0.7) * 0.1
    ])),
    poseLandmarks: [[0.5, 0.4 + frameIndex * 0.02, 0, 0.9 - frameIndex * 0.02]],
    faceLandmarks: Array(10).fill(0).map(() => [0.4 + frameIndex * 0.01, 0.3 + frameIndex * 0.01, 0])
  })),
  metadata: {
    modalities: {
      hands: { present: true, frameCount: 5, coverage: 1.0 },
      pose: { present: true, frameCount: 5, coverage: 1.0 },
      face: { present: true, frameCount: 5, coverage: 1.0 }
    }
  }
};

// Create bundles
const bundles = [
  { name: 'multimodal-test-bundle.zip', metadata: multimodalGesture, landmarks: multimodalLandmarks },
  { name: 'hands-only-test-bundle.zip', metadata: handsOnlyGesture, landmarks: handsOnlyLandmarks },
  { name: 'complex-multimodal-bundle.zip', metadata: complexGesture, landmarks: complexLandmarks }
];

bundles.forEach(bundle => {
  const zip = new AdmZip();
  zip.addFile('metadata.json', Buffer.from(JSON.stringify(bundle.metadata, null, 2)));
  zip.addFile('landmarks.json', Buffer.from(JSON.stringify(bundle.landmarks, null, 2)));
  
  const outputPath = join(outputDir, bundle.name);
  zip.writeZip(outputPath);
  console.log(`Created ${outputPath}`);
});

console.log(`Created ${bundles.length} test bundles in ${outputDir}/`);