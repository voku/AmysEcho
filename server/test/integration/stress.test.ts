import request from 'supertest';
import { addUser, type Database } from '../../src/db.js';
import { app, databaseReady } from '../../src/server.js';
import { AuthService } from '../../src/services/authService.js';
import AdmZip from 'adm-zip';
import path from 'path';

describe('System Stress & Stability Integration', () => {
  let accessToken: string;
  let profiles: string[] = [];
  const gestures = ['ESSEN', 'TRINKEN'];

  beforeAll(async () => {
    await databaseReady;
    accessToken = AuthService.generateTokens({
      id: 'stress-tester',
      username: 'stress',
      role: 'admin',
    }).accessToken;

    const db = app.locals.dbInstance as Database | undefined;
    if (db && !db.users.find((user) => user.id === 'stress-tester')) {
      addUser(db, {
        id: 'stress-tester',
        username: 'stress',
        email: 'stress@example.com',
        passwordHash: 'not-used-in-this-test',
        role: 'admin',
        createdAt: Date.now(),
        emailVerifiedAt: Date.now(),
      });
    }

    const profileResponses = await Promise.all([
      request(app)
        .post('/api/v1/profiles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ displayName: 'Amy Stress 1' }),
      request(app)
        .post('/api/v1/profiles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ displayName: 'Caregiver Stress 2' }),
    ]);
    profiles = profileResponses.map((response) => response.body.profile.id);

    const { saveTrainingManifest } = await import('../../src/services/trainingJsonStore.js');
    saveTrainingManifest({ entries: [] });
  });

  function createBundleBuffer(profileId: string, label: string): Buffer {
    const zip = new AdmZip();
    const frameCount = 5;
    
    const metadata = {
      label,
      profileId,
      capturedAt: new Date().toISOString(),
      source: 'stress-test-integration'
    };

    const landmarks = {
      frames: Array(frameCount).fill(0).map(() => ({
        landmarks: Array(2).fill(0).map(() => Array(21).fill(0).map(() => [0.1, 0.2, 0.3])),
        poseLandmarks: [[0.5, 0.5, 0.5, 0.8]],
        faceLandmarks: [[0.3, 0.3, 0.3]]
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

  it('handles multiple uploads and concurrent training triggers', async () => {
    // 1. Concurrent Uploads
    const uploadPromises = [];
    for (const profile of profiles) {
      for (const gesture of gestures) {
        const buffer = createBundleBuffer(profile, gesture);
        uploadPromises.push(
          request(app)
            .post('/api/v1/dgs/sample-bundles')
            .set('Authorization', `Bearer ${accessToken}`)
            .set('Content-Type', 'application/zip')
            .send(buffer)
        );
      }
    }

    const uploadResponses = await Promise.all(uploadPromises);
    uploadResponses.forEach(res => {
      expect(res.status).toBe(202);
      expect(res.body.status).toBe('queued');
    });

    // 2. Concurrent Training Triggers
    const triggerPromises = [1, 2].map(() => 
      request(app)
        .post('/train-model')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Content-Type', 'application/json')
        .send({ trigger: 'bundles' })
    );

    const triggerResponses = await Promise.all(triggerPromises);
    triggerResponses.forEach(res => {
      expect([202, 200]).toContain(res.status);
      expect(['queued', 'running', 'completed']).toContain(res.body.status);
    });

    // 3. Final Manifest Consistency Check
    try {
      const { loadTrainingManifest } = await import('../../src/services/trainingJsonStore.js');
      const manifest = loadTrainingManifest();
      expect(Array.isArray(manifest.entries)).toBe(true);
      expect(manifest.entries.length).toBeGreaterThanOrEqual(4);
    } catch (err) {
      console.error('Failed to verify training manifest:', err);
      throw err;
    }
  }, 30000); // Higher timeout for stress test
});
