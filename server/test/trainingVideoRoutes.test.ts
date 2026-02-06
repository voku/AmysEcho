import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import express from 'express';
import type { Express } from 'express';
import { AuthService } from '../src/services/authService.js';
import type { Database } from '../src/db.js';
import type { ProfileRegistry } from '../src/services/profileRegistry.js';

describe('Training Video Routes', () => {
  let app: Express;
  let dataDir: string;
  let accessToken: string;

  const PROFILE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const BUNDLE_ID = 'test-bundle-001';
  const USER_ID = 'video-tester';

  // Minimal mock db and registry so isProfileAuthorized grants access
  const mockDb: Database = {
    profiles: [{ id: PROFILE_ID, userId: USER_ID } as any],
  } as Database;

  const mockRegistry: ProfileRegistry = {
    profiles: [{ id: PROFILE_ID, caregivers: [] } as any],
  } as ProfileRegistry;

  beforeAll(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-video-'));
    process.env.AMY_ECHO_DATA_DIR = dataDir;
    jest.resetModules();

    accessToken = AuthService.generateTokens({
      id: USER_ID,
      username: 'tester',
      role: 'caregiver',
    }).accessToken;

    const { registerTrainingVideoRoutes } = await import(
      '../src/routes/trainingVideoRoutes.js'
    );
    const { auth } = await import('../src/middleware/auth.js');
    app = express();
    app.use(express.json());
    registerTrainingVideoRoutes(app, {
      authMiddleware: auth,
      db: mockDb,
      registry: mockRegistry,
    });
  });

  afterAll(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  const authHeaders = () => ({
    Authorization: `Bearer ${accessToken}`,
  });

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

    it('returns 403 for profile the user does not own', async () => {
      const otherProfileId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      const res = await request(app)
        .get(`/api/v1/profiles/${otherProfileId}/training-videos`)
        .set(authHeaders());
      expect(res.status).toBe(403);
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

  describe('GET /api/v1/dgs-videos', () => {
    it('returns reference videos from DGS manifest', async () => {
      const res = await request(app)
        .get('/api/v1/dgs-videos')
        .set(authHeaders());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.videos)).toBe(true);
      // The real dgs_manifest.json should have entries
      if (res.body.videos.length > 0) {
        expect(res.body.videos[0]).toHaveProperty('label');
        expect(res.body.videos[0]).toHaveProperty('filename');
        expect(res.body.videos[0]).toHaveProperty('clipUrl');
        expect(res.body.videos[0].clipUrl).toMatch(/^\/api\/v1\/dgs-videos\//);
      }
    });

    it('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/v1/dgs-videos');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/dgs-videos/:filename', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/v1/dgs-videos/alle.mp4');
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid file extension', async () => {
      const res = await request(app)
        .get('/api/v1/dgs-videos/test.txt')
        .set(authHeaders());
      expect(res.status).toBe(400);
    });

    it('rejects path traversal attempts', async () => {
      const res = await request(app)
        .get('/api/v1/dgs-videos/..%2F..%2Fpackage.json')
        .set(authHeaders());
      // Should be rejected by either path check or extension check
      expect([400, 403]).toContain(res.status);
    });

    it('returns 404 for non-existent video', async () => {
      const res = await request(app)
        .get('/api/v1/dgs-videos/nonexistent_video.mp4')
        .set(authHeaders());
      expect(res.status).toBe(404);
    });

    it('streams an existing DGS reference video', async () => {
      // First get the list to find a real video filename
      const listRes = await request(app)
        .get('/api/v1/dgs-videos')
        .set(authHeaders());

      if (listRes.body.videos.length === 0) {
        // No DGS videos available in test env — skip gracefully
        return;
      }

      const firstVideo = listRes.body.videos[0];
      const res = await request(app)
        .get(`/api/v1/dgs-videos/${encodeURIComponent(firstVideo.filename)}`)
        .set(authHeaders());
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('video/mp4');
    });
  });
});
