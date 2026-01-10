import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import express, { type Express } from 'express';
import request from 'supertest';
import { AuthService } from '../src/services/authService.js';
import { addUser, createDatabase, Database, saveDatabase } from '../src/db.js';
import { registerAuthRoutes } from '../src/routes/authRoutes.js';
import { type EmailService } from '../src/services/emailService.js';
import { withFileLock } from '../src/utils/fileLock.js';

describe('auth routes', () => {
  let app: Express;
  let db: Database;
  let dbFilePath: string;
  let tmpDir: string;
  let emailService: EmailService;

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
    emailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };
    registerAuthRoutes(app, { db, dbFilePath, withFileLock, emailService });
  });

  it('rejects duplicate registration attempts', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'amy', email: 'amy@example.com', password: 'super-secure-password' })
      .expect(201);

    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'amy', email: 'amy2@example.com', password: 'another-password' })
      .expect(409);

    expect(response.body.error).toBe('Benutzername oder E-Mail-Adresse bereits vergeben.');
  });

  it('rejects duplicate email registrations', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'amy', email: 'amy@example.com', password: 'super-secure-password' })
      .expect(201);

    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'amy-two', email: 'amy@example.com', password: 'another-password' })
      .expect(409);

    expect(response.body.error).toBe('Benutzername oder E-Mail-Adresse bereits vergeben.');
  });

  it('registers a new user and persists the hashed password', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'amy', email: 'amy@example.com', password: 'super-secure-password' })
      .expect(201);

    expect(response.body.message).toBe('Registrierung erfolgreich. Bitte bestätige deine E-Mail-Adresse.');
    expect(db.users).toHaveLength(1);
    expect(db.users[0].passwordHash).not.toBe('super-secure-password');
    expect(db.users[0].emailVerificationTokenHash).toBeDefined();

    const saved = JSON.parse(await fs.readFile(dbFilePath, 'utf8'));
    expect(saved.users).toHaveLength(1);
    expect(saved.users[0].passwordHash).toBe(db.users[0].passwordHash);
    expect(emailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it('logs in an existing user with valid credentials', async () => {
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
      email: 'amy@example.com',
      passwordHash,
      role: 'caregiver',
      createdAt: Date.now(),
      emailVerifiedAt: Date.now(),
    });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'amy', password: 'wrongpw' })
      .expect(401);

    expect(response.body.error).toBe('Ungültige Zugangsdaten.');
  });

  it('refreshes tokens for a valid refresh token', async () => {
    const registration = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'amy', email: 'amy@example.com', password: 'super-secure-password' })
      .expect(201);

    db.users[0].emailVerifiedAt = Date.now();
    await saveDatabase(db, dbFilePath);

    const refreshResponse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: AuthService.generateTokens({ id: db.users[0].id, username: 'amy', role: 'caregiver' }).refreshToken })
      .expect(200);

    expect(refreshResponse.body.tokens?.accessToken).toBeDefined();
    expect(refreshResponse.body.user).toEqual({ id: db.users[0].id, username: 'amy', role: 'caregiver' });
  });

  it('rejects refresh when the user no longer exists', async () => {
    const registration = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'amy', email: 'amy@example.com', password: 'super-secure-password' })
      .expect(201);

    db.users = [];

    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: AuthService.generateTokens({ id: 'missing', username: 'amy', role: 'caregiver' }).refreshToken })
      .expect(401);

    expect(response.body.error).toBe('Sitzung abgelaufen. Bitte neu anmelden.');
  });

  it('rejects malformed refresh payloads', async () => {
    const response = await request(app).post('/api/v1/auth/refresh').send({}).expect(400);

    expect(response.body.error).toBe('Aktualisierungs-Token wird benötigt.');
  });

  it('rejects invalid JWT refresh tokens', async () => {
    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'not.a.valid.jwt.token' })
      .expect(401);

    expect(response.body.error).toBe('Sitzung abgelaufen. Bitte neu anmelden.');
  });

  it('rejects malformed credential payloads', async () => {
    const missingCredentials = await request(app).post('/api/v1/auth/register').send({}).expect(400);
    expect(missingCredentials.body.error).toBe('Nutzername, E-Mail-Adresse und Passwort werden benötigt.');

    const emptyUsername = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: '   ', password: 'topsecret' })
      .expect(400);
    expect(emptyUsername.body.error).toBe('Nutzername und Passwort werden benötigt.');
  });

  it('issues a password reset token and stores the hashed value', async () => {
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

    const response = await request(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'amy@example.com' })
      .expect(202);

    expect(response.body.resetToken).toBeUndefined();
    expect(db.users[0].passwordResetTokenHash).toBeDefined();
    expect(db.users[0].passwordResetExpiresAt).toBeGreaterThan(Date.now());
    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it('resets the password when the reset token is valid', async () => {
    const passwordHash = await AuthService.hashPassword('topsecret');
    const resetToken = 'reset-123';
    const resetTokenHash = createHash('sha256').update(resetToken).digest('hex');
    addUser(db, {
      id: 'user-1',
      username: 'amy',
      email: 'amy@example.com',
      passwordHash,
      role: 'caregiver',
      createdAt: Date.now(),
      emailVerifiedAt: Date.now(),
      passwordResetTokenHash: resetTokenHash,
      passwordResetExpiresAt: Date.now() + 10_000,
      passwordResetRequestedAt: Date.now(),
    });

    await request(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ email: 'amy@example.com', resetToken, password: 'new-secret-123' })
      .expect(200);

    expect(db.users[0].passwordResetTokenHash).toBeUndefined();

    await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'amy', password: 'new-secret-123' })
      .expect(200);
  });

  it('rejects expired reset tokens', async () => {
    const passwordHash = await AuthService.hashPassword('topsecret');
    const resetToken = 'expired-token';
    const resetTokenHash = createHash('sha256').update(resetToken).digest('hex');
    addUser(db, {
      id: 'user-1',
      username: 'amy',
      email: 'amy@example.com',
      passwordHash,
      role: 'caregiver',
      createdAt: Date.now(),
      emailVerifiedAt: Date.now(),
      passwordResetTokenHash: resetTokenHash,
      passwordResetExpiresAt: Date.now() - 1000,
      passwordResetRequestedAt: Date.now() - 2000,
    });

    const response = await request(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ email: 'amy@example.com', resetToken, password: 'new-secret-123' })
      .expect(400);

    expect(response.body.error).toBe('Ungültiger oder abgelaufener Reset-Code.');
    expect(db.users[0].passwordResetTokenHash).toBeUndefined();
  });

  it('blocks login until the email is verified', async () => {
    const passwordHash = await AuthService.hashPassword('topsecret');
    addUser(db, {
      id: 'user-1',
      username: 'amy',
      email: 'amy@example.com',
      passwordHash,
      role: 'caregiver',
      createdAt: Date.now(),
    });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'amy', password: 'topsecret' })
      .expect(403);

    expect(response.body.error).toBe('E-Mail-Adresse noch nicht bestätigt. Bitte prüfe deine E-Mails.');
  });

  it('verifies email with a valid confirmation code', async () => {
    const passwordHash = await AuthService.hashPassword('topsecret');
    const verificationToken = 'verify-123';
    const verificationTokenHash = createHash('sha256').update(verificationToken).digest('hex');
    addUser(db, {
      id: 'user-1',
      username: 'amy',
      email: 'amy@example.com',
      passwordHash,
      role: 'caregiver',
      createdAt: Date.now(),
      emailVerificationTokenHash: verificationTokenHash,
      emailVerificationExpiresAt: Date.now() + 10_000,
      emailVerificationSentAt: Date.now(),
    });

    const response = await request(app)
      .post('/api/v1/auth/verify-email/confirm')
      .send({ email: 'amy@example.com', verificationToken })
      .expect(200);

    expect(response.body.message).toBe('E-Mail-Adresse wurde bestätigt. Du kannst dich jetzt anmelden.');
    expect(db.users[0].emailVerifiedAt).toBeDefined();
    expect(db.users[0].emailVerificationTokenHash).toBeUndefined();
  });
});
