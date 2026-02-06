import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import express from 'express';
import type { Express } from 'express';
import { AuthService } from '../src/services/authService.js';

describe('Training Video Routes', () => {
  let app: Express;
  let dataDir: string;
  let accessToken: string;

  beforeAll(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-video-'));
    process.env.AMY_ECHO_DATA_DIR = dataDir;
    jest.resetModules();

    accessToken = AuthService.generateTokens({
      id: 'video-tester',
      username: 'tester',
      role: 'caregiver',
    }).accessToken;

    const { registerTrainingVideoRoutes } = await import(
      '../src/routes/trainingVideoRoutes.js'
    );
    const { auth } = await import('../src/middleware/auth.js');
    app = express();
    app.use(express.json());
    registerTrainingVideoRoutes(app, { authMiddleware: auth });
  });

  afterAll(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  const authHeaders = () => ({
    Authorization: `Bearer ${accessToken}`,
  });

  const PROFILE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const BUNDLE_ID = 'test-bundle-001';

  async function seedManifest(entries: object[]) {
    const datasetsDir = path.join(dataDir, 'datasets');
    await fs.mkdir(datasetsDir, { recursive: true });
    await fs.writeFile(
      path.join(datasetsDir, 'training_manifest.json'),
      JSON.stringify({ entries }),
    );
  }

  async function seedVideoFile(directory: string, filename: string) {
    const fullDir = path.join(dataDir, directory);
    await fs.mkdir(fullDir, { recursive: true });
    await fs.writeFile(path.join(fullDir, filename), 'fake-video-content');
  }

  describe('GET /api/v1/profiles/:id/training-videos', () => {
    it('returns 400 for invalid profile ID', async () => {
      const res = await request(app)
        .get('/api/v1/profiles/invalid/training-videos')
        .set(authHeaders());
      expect(res.status).toBe(400);
    });

    it('returns empty list when no manifest exists', async () => {
      const res = await request(app)
        .get(`/api/v1/profiles/${PROFILE_ID}/training-videos`)
        .set(authHeaders());
      expect(res.status).toBe(200);
      expect(res.body.videos).toEqual([]);
    });

    it('returns videos for the given profile', async () => {
      await seedManifest([
        {
          id: BUNDLE_ID,
          profileId: PROFILE_ID,
          label: 'Hallo',
          capturedAt: '2026-01-15T10:00:00Z',
          storage: {
            directory: `uploads/${PROFILE_ID}/${BUNDLE_ID}`,
            clip: 'clip.webm',
            still: 'still.jpg',
            files: ['metadata.json', 'landmarks.json', 'clip.webm', 'still.jpg'],
          },
          metadata: {
            recording: {
              clipDurationMs: 2000,
              clipMimeType: 'video/webm',
            },
          },
          receivedAt: '2026-01-15T10:05:00Z',
        },
        {
          id: 'other-bundle',
          profileId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          label: 'Tschüss',
          storage: {
            directory: 'uploads/other/other-bundle',
            clip: 'clip.mp4',
            files: ['clip.mp4'],
          },
          metadata: {},
          receivedAt: '2026-01-15T11:00:00Z',
        },
      ]);

      const res = await request(app)
        .get(`/api/v1/profiles/${PROFILE_ID}/training-videos`)
        .set(authHeaders());
      expect(res.status).toBe(200);
      expect(res.body.videos).toHaveLength(1);
      expect(res.body.videos[0].label).toBe('Hallo');
      expect(res.body.videos[0].clipUrl).toBe(
        `/api/v1/training-videos/${BUNDLE_ID}/clip`,
      );
      expect(res.body.videos[0].stillUrl).toBe(
        `/api/v1/training-videos/${BUNDLE_ID}/still`,
      );
      expect(res.body.videos[0].clipDurationMs).toBe(2000);
    });

    it('excludes entries without clip', async () => {
      await seedManifest([
        {
          id: 'no-clip',
          profileId: PROFILE_ID,
          label: 'NoClip',
          storage: { directory: 'uploads/x/y', files: ['landmarks.json'] },
          metadata: {},
          receivedAt: '2026-01-15T10:05:00Z',
        },
      ]);

      const res = await request(app)
        .get(`/api/v1/profiles/${PROFILE_ID}/training-videos`)
        .set(authHeaders());
      expect(res.status).toBe(200);
      expect(res.body.videos).toHaveLength(0);
    });
  });

  describe('GET /api/v1/training-videos/:bundleId/clip', () => {
    beforeEach(async () => {
      const dir = `uploads/${PROFILE_ID}/${BUNDLE_ID}`;
      await seedManifest([
        {
          id: BUNDLE_ID,
          profileId: PROFILE_ID,
          label: 'Hallo',
          storage: {
            directory: dir,
            clip: 'clip.webm',
            still: 'still.jpg',
            files: ['clip.webm', 'still.jpg'],
          },
          metadata: {
            recording: { clipMimeType: 'video/webm' },
          },
          receivedAt: '2026-01-15T10:05:00Z',
        },
      ]);
      await seedVideoFile(dir, 'clip.webm');
      await seedVideoFile(dir, 'still.jpg');
    });

    it('streams the video clip', async () => {
      const res = await request(app)
        .get(`/api/v1/training-videos/${BUNDLE_ID}/clip`)
        .set(authHeaders())
        .buffer(true);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('video/webm');
      expect(res.body.toString()).toBe('fake-video-content');
    });

    it('returns 404 for unknown bundle', async () => {
      const res = await request(app)
        .get('/api/v1/training-videos/nonexistent/clip')
        .set(authHeaders());
      expect(res.status).toBe(404);
    });

    it('returns 401 without auth token', async () => {
      const res = await request(app).get(
        `/api/v1/training-videos/${BUNDLE_ID}/clip`,
      );
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/training-videos/:bundleId/still', () => {
    beforeEach(async () => {
      const dir = `uploads/${PROFILE_ID}/${BUNDLE_ID}`;
      await seedManifest([
        {
          id: BUNDLE_ID,
          profileId: PROFILE_ID,
          label: 'Hallo',
          storage: {
            directory: dir,
            clip: 'clip.webm',
            still: 'still.jpg',
            files: ['clip.webm', 'still.jpg'],
          },
          metadata: {},
          receivedAt: '2026-01-15T10:05:00Z',
        },
      ]);
      await seedVideoFile(dir, 'still.jpg');
    });

    it('serves the still image', async () => {
      const res = await request(app)
        .get(`/api/v1/training-videos/${BUNDLE_ID}/still`)
        .set(authHeaders());
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
    });

    it('returns 404 for bundle without still', async () => {
      await seedManifest([
        {
          id: 'no-still',
          profileId: PROFILE_ID,
          label: 'Hallo',
          storage: {
            directory: `uploads/${PROFILE_ID}/no-still`,
            clip: 'clip.webm',
            files: ['clip.webm'],
          },
          metadata: {},
          receivedAt: '2026-01-15T10:05:00Z',
        },
      ]);

      const res = await request(app)
        .get('/api/v1/training-videos/no-still/still')
        .set(authHeaders());
      expect(res.status).toBe(404);
    });
  });
});
