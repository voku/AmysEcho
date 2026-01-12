import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import express, { type Express } from 'express';
import request from 'supertest';
import { AuthService } from '../src/services/authService.js';
import { addUser, createDatabase, type Database, saveDatabase } from '../src/db.js';
import { registerUserRoutes } from '../src/routes/userRoutes.js';
import { auth } from '../src/middleware/auth.js';

describe('user routes', () => {
  let app: Express;
  let db: Database;
  let dbFilePath: string;
  let tmpDir: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-user-'));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    db = createDatabase();
    dbFilePath = path.join(tmpDir, `db-${Date.now()}.json`);
    app = express();
    app.use(express.json());
    registerUserRoutes(app, { db, dbFilePath, authMiddleware: auth });
  });

  it('updates the authenticated user profile', async () => {
    const passwordHash = await AuthService.hashPassword('topsecret');
    addUser(db, {
      id: 'user-1',
      username: 'amy',
      email: 'amy@example.com',
      passwordHash,
      role: 'caregiver',
      createdAt: Date.now(),
      emailVerifiedAt: Date.now(),
    });
    await saveDatabase(db, dbFilePath);

    const token = AuthService.generateTokens({ id: 'user-1', username: 'amy', role: 'caregiver' }).accessToken;

    const response = await request(app)
      .put('/api/user/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Amy Doe' })
      .expect(200);

    expect(response.body.user).toMatchObject({ id: 'user-1', displayName: 'Amy Doe' });
  });

  it('rejects IDOR attempts to change another user', async () => {
    const passwordHash = await AuthService.hashPassword('topsecret');
    addUser(db, {
      id: 'user-1',
      username: 'amy',
      email: 'amy@example.com',
      passwordHash,
      role: 'caregiver',
      createdAt: Date.now(),
      emailVerifiedAt: Date.now(),
    });
    addUser(db, {
      id: 'user-2',
      username: 'bob',
      email: 'bob@example.com',
      passwordHash,
      role: 'caregiver',
      createdAt: Date.now(),
      emailVerifiedAt: Date.now(),
    });
    await saveDatabase(db, dbFilePath);

    const token = AuthService.generateTokens({ id: 'user-1', username: 'amy', role: 'caregiver' }).accessToken;

    const response = await request(app)
      .put('/api/user/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Hacked', userId: 'user-2' })
      .expect(403);

    expect(response.body.error).toBe('Änderungen für andere Konten sind nicht erlaubt.');
  });

  it('rejects password changes with invalid current password', async () => {
    const passwordHash = await AuthService.hashPassword('topsecret');
    addUser(db, {
      id: 'user-1',
      username: 'amy',
      email: 'amy@example.com',
      passwordHash,
      role: 'caregiver',
      createdAt: Date.now(),
      emailVerifiedAt: Date.now(),
    });
    await saveDatabase(db, dbFilePath);

    const token = AuthService.generateTokens({ id: 'user-1', username: 'amy', role: 'caregiver' }).accessToken;

    const response = await request(app)
      .put('/api/user/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrongpw', newPassword: 'new-secret-123' })
      .expect(400);

    expect(response.body.error).toBe('Aktuelles Passwort ist falsch.');
  });
});
