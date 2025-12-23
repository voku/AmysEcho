import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:5000';
const TOKEN = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXItMTIzIiwidXNlcm5hbWUiOiJ0ZXN0dXNlciIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzY2NTE1MTU5LCJleHAiOjE3NjY1MTYwNTl9.EcRKMhCAeQ8ZVOvWNT7T6mxP_sFZflWTlyyC1VO73wg";

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
  const results = [];

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

      const data = await response.json();
      console.log(`✅ Uploaded: ${data.id || data.error}`);
      results.push(data);
    }
  }

  console.log('\n⚖️ Triggering Concurrent Training Jobs...');
  const triggers = [1, 2, 3].map(() => 
    fetch(`${API_BASE}/train-model`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': TOKEN
      },
      body: JSON.stringify({ trigger: 'bundles' })
    }).then(r => r.json())
  );

  const triggerResults = await Promise.all(triggers);
  triggerResults.forEach((res, i) => console.log(`🔄 Training Trigger ${i+1}: ${res.status} (Job: ${res.jobId})`));

  console.log('\n⏳ Waiting for jobs to stabilize (10s)...');
  await new Promise(r => setTimeout(r, 10000));

  console.log('\n📊 Final Manifest Check:');
  const manifest = JSON.parse(fs.readFileSync('data/datasets/training_manifest.json', 'utf8'));
  console.log(`Count: ${manifest.entries.length} entries recorded.`);
  
  const finalJobId = triggerResults[triggerResults.length - 1].jobId;
  const statusRes = await fetch(`${API_BASE}/api/v1/train-status/${finalJobId}`, {
    headers: { 'Authorization': TOKEN }
  });
  console.log(`🏁 Final Job Status:`, await statusRes.json());
}

runStressTest().catch(console.error);
