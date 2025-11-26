import express from 'express';
import { randomUUID } from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { addUser, Database, findUserByUsername, saveDatabase } from '../db.js';
import { AuthService } from '../services/authService.js';
import logger from '../services/logger.js';
import { withFileLock } from '../utils/fileLock.js';

interface AuthRouteDeps {
  db: Database;
  dbFilePath: string;
  withFileLock: typeof withFileLock;
}

const CredentialsSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(128),
});

const normalizeUsername = (username: string) => username.trim();

export const createAuthLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Zu viele Anmeldeversuche. Bitte später erneut versuchen.' },
  });

export function registerAuthRoutes(app: express.Express, deps: AuthRouteDeps) {
  const authLimiter = createAuthLimiter();

  app.post('/api/v1/auth/register', authLimiter, async (req, res) => {
    const parsed = CredentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Nutzername und Passwort werden benötigt.', details: parsed.error.flatten() });
    }

    const username = normalizeUsername(parsed.data.username);
    const password = parsed.data.password;

    if (!username) {
      return res.status(400).json({ error: 'Nutzername darf nicht leer sein.' });
    }

    try {
      let createdUser = findUserByUsername(deps.db, username);
      if (createdUser) {
        return res.status(409).json({ error: 'Benutzername ist bereits vergeben.' });
      }
      const passwordHash = await AuthService.hashPassword(password);

      await deps.withFileLock(deps.dbFilePath, async () => {
        if (findUserByUsername(deps.db, username)) return;
        const user = {
          id: randomUUID(),
          username,
          passwordHash,
          role: 'caregiver' as const,
          createdAt: Date.now(),
        };
        addUser(deps.db, user);
        await saveDatabase(deps.db, deps.dbFilePath);
        createdUser = user;
      });

      if (!createdUser) {
        return res.status(409).json({ error: 'Benutzername ist bereits vergeben.' });
      }

      const publicUser = AuthService.toUser(createdUser);
      const tokens = AuthService.generateTokens(publicUser);
      logger.info('User registered', { userId: publicUser.id, username: publicUser.username });
      return res.status(201).json({ user: publicUser, tokens });
    } catch (error: any) {
      logger.error('Registration failed', { error: error?.message });
      return res.status(500).json({ error: 'Registrierung fehlgeschlagen.' });
    }
  });

  app.post('/api/v1/auth/login', authLimiter, async (req, res) => {
    const parsed = CredentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Nutzername und Passwort werden benötigt.' });
    }

    const username = normalizeUsername(parsed.data.username);
    const password = parsed.data.password;
    if (!username) {
      return res.status(400).json({ error: 'Nutzername darf nicht leer sein.' });
    }

    try {
      const user = findUserByUsername(deps.db, username);
      const passwordHash = user?.passwordHash ?? AuthService.DUMMY_PASSWORD_HASH;
      const valid = await AuthService.verifyPassword(password, passwordHash);
      if (!user || !valid) {
        return res.status(401).json({ error: 'Ungültige Zugangsdaten.' });
      }

      const publicUser = AuthService.toUser(user);
      const tokens = AuthService.generateTokens(publicUser);
      logger.info('User login', { userId: publicUser.id, username: publicUser.username });
      return res.json({ user: publicUser, tokens });
    } catch (error: any) {
      logger.error('Login failed', { error: error?.message });
      return res.status(500).json({ error: 'Anmeldung fehlgeschlagen.' });
    }
  });
}
