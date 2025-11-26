import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import express, { type Express } from 'express';
import request from 'supertest';
import { AuthService } from '../src/services/authService.js';
import { addUser, createDatabase, Database, saveDatabase } from '../src/db.js';
import { registerAuthRoutes } from '../src/routes/authRoutes.js';
import { withFileLock } from '../src/utils/fileLock.js';

describe('auth routes', () => {
  let app: Express;
  let db: Database;
  let dbFilePath: string;
  let tmpDir: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-auth-'));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    db = createDatabase();
    dbFilePath = path.join(tmpDir, `db-${Date.now()}.json`);
    app = express();
    app.use(express.json());
    registerAuthRoutes(app, { db, dbFilePath, withFileLock });
  });

  it('rejects duplicate registration attempts', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'amy', password: 'super-secure-password' })
      .expect(201);

    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'amy', password: 'another-password' })
      .expect(409);

    expect(response.body.error).toBe('Benutzername ist bereits vergeben.');
  });

  it('registers a new user and persists the hashed password', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'amy', password: 'super-secure-password' })
      .expect(201);

    expect(response.body.tokens?.accessToken).toBeDefined();
    expect(response.body.user).toMatchObject({ username: 'amy', role: 'caregiver' });
    expect(db.users).toHaveLength(1);
    expect(db.users[0].passwordHash).not.toBe('super-secure-password');

    const saved = JSON.parse(await fs.readFile(dbFilePath, 'utf8'));
    expect(saved.users).toHaveLength(1);
    expect(saved.users[0].passwordHash).toBe(db.users[0].passwordHash);
  });

  it('logs in an existing user with valid credentials', async () => {
    const passwordHash = await AuthService.hashPassword('topsecret');
    addUser(db, {
      id: 'user-1',
      username: 'amy',
      passwordHash,
      role: 'caregiver',
      createdAt: Date.now(),
    });
    await saveDatabase(db, dbFilePath);

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: ' amy ', password: 'topsecret' })
      .expect(200);

    expect(response.body.tokens?.accessToken).toBeDefined();
    expect(response.body.user).toEqual({ id: 'user-1', username: 'amy', role: 'caregiver' });
  });

  it('rejects invalid credentials', async () => {
    const passwordHash = await AuthService.hashPassword('topsecret');
    addUser(db, {
      id: 'user-1',
      username: 'amy',
      passwordHash,
      role: 'caregiver',
      createdAt: Date.now(),
    });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'amy', password: 'wrongpw' })
      .expect(401);

    expect(response.body.error).toBe('Ungültige Zugangsdaten.');
  });

  it('rejects malformed credential payloads', async () => {
    const missingCredentials = await request(app).post('/api/v1/auth/register').send({}).expect(400);
    expect(missingCredentials.body.error).toBe('Nutzername und Passwort werden benötigt.');

    const emptyUsername = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: '   ', password: 'topsecret' })
      .expect(400);
    expect(emptyUsername.body.error).toBe('Nutzername darf nicht leer sein.');
  });
});
