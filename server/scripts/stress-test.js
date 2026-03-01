import AdmZip from 'adm-zip';
import fs from 'fs';

const API_BASE = 'http://localhost:5000';
const TOKEN = process.env.STRESS_TEST_TOKEN;

if (!TOKEN) {
  console.error('STRESS_TEST_TOKEN environment variable not set. Please generate a token and export it.');
  console.log('Usage: STRESS_TEST_TOKEN=$(npm run -s generate-token --prefix server) npm run stress-test --prefix server');
  process.exit(1);
}

const profiles = ['amy-primary', 'caregiver-alpha', 'guest-beta'];
const gestures = ['ESSEN', 'TRINKEN', 'HILFE', 'SPIELEN', 'SCHLAFEN'];

async function createBundle(profileId, label) {
  const zip = new AdmZip();
  const frameCount = 30 + Math.floor(Math.random() * 30);
  
  const metadata = {
    label,
    profileId,
    capturedAt: new Date().toISOString(),
    source: 'stress-test-v1'
  };

  const landmarks = {
    frames: Array(frameCount).fill(0).map(() => ({
      landmarks: Array(2).fill(0).map(() => Array(21).fill(0).map(() => [Math.random(), Math.random(), Math.random()])),
      poseLandmarks: Array(11).fill(0).map(() => [Math.random(), Math.random(), Math.random(), 0.8]),
      faceLandmarks: Array(10).fill(0).map(() => [Math.random(), Math.random(), Math.random()])
    })),
    metadata: {
      modalities: {
        hands: { present: true, frameCount, coverage: 1.0 },
        pose: { present: true, frameCount, coverage: 1.0 },
        face: { present: true, frameCount, coverage: 1.0 }
      }
    }
  };

  zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata)));
  zip.addFile('landmarks.json', Buffer.from(JSON.stringify(landmarks)));
  return zip.toBuffer();
}

async function runStressTest() {
  console.log('🚀 Starting Amy\'s Echo Stress Test...');

  for (const profile of profiles) {
    for (const gesture of gestures) {
      console.log(`📦 Preparing bundle: ${profile} -> ${gesture}`);
      const buffer = await createBundle(profile, gesture);
      
      const response = await fetch(`${API_BASE}/api/v1/dgs/sample-bundles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/zip',
          'Authorization': TOKEN
        },
        body: buffer
      });

      if (!response.ok) {
        console.error(`❌ Upload failed for ${profile} -> ${gesture} with status ${response.status}`);
        const errorText = await response.text();
        console.error(`   Error: ${errorText}`);
        continue;
      }

      const data = await response.json();
      console.log(`✅ Uploaded: ${data.id}`);
    }
  }

  console.log('\n⚖️ Triggering Concurrent Training Jobs...');
  const triggers = [1, 2, 3].map(async (i) => {
    const response = await fetch(`${API_BASE}/train-model`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': TOKEN
      },
      body: JSON.stringify({ trigger: 'bundles' })
    });

    if (!response.ok) {
      throw new Error(`Training trigger ${i} failed with status ${response.status}: ${await response.text()}`);
    }
    return response.json();
  });

  const triggerResults = await Promise.all(triggers);
  triggerResults.forEach((res, i) => console.log(`🔄 Training Trigger ${i+1}: ${res.status} (Job: ${res.jobId})`));

  console.log('\n⏳ Waiting for jobs to stabilize (10s)...');
  await new Promise(r => setTimeout(r, 10000));

  console.log('\n📊 Final Manifest Check:');
  try {
    if (fs.existsSync('data/datasets/training_manifest.json')) {
      const manifestRaw = fs.readFileSync('data/datasets/training_manifest.json', 'utf8');
      const manifest = JSON.parse(manifestRaw);
      console.log(`Count: ${manifest.entries.length} entries recorded.`);
    } else {
      console.warn('⚠️ Warning: data/datasets/training_manifest.json not found.');
    }
  } catch (err) {
    console.error('❌ Error reading or parsing training manifest:', err.message);
    if (err instanceof SyntaxError) {
      console.error('   Details: Invalid JSON structure in manifest file.');
    }
  }
  
  const finalJobId = triggerResults[triggerResults.length - 1].jobId;
  const statusRes = await fetch(`${API_BASE}/api/v1/train-status/${finalJobId}`, {
    headers: { 'Authorization': TOKEN }
  });

  if (!statusRes.ok) {
    console.error(`❌ Status check failed with status ${statusRes.status}`);
  } else {
    console.log(`🏁 Final Job Status:`, await statusRes.json());
  }
}

runStressTest().catch(console.error);
