import express from 'express';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  addUser,
  Database,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  saveDatabase,
  seedProfileSymbols,
} from '../db.js';
import { AuthService } from '../services/authService.js';
import { type EmailService } from '../services/emailService.js';
import logger from '../services/logger.js';
import { type StoredUser } from '../types.js';
import { withFileLock } from '../utils/fileLock.js';

interface AuthRouteDeps {
  db: Database;
  dbFilePath: string;
  withFileLock: typeof withFileLock;
  emailService: EmailService;
}

const LoginSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(128),
});

const normalizeUsername = (username: string) => username.toLowerCase();
const normalizeEmail = (email: string) => email.toLowerCase();

const RegistrationSchema = z.object({
  username: z.string().trim().min(3).max(50),
  email: z.string().trim().email().max(254),
  password: z.string().min(6).max(128),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const PasswordResetRequestSchema = z.object({
  email: z.string().trim().email().max(254),
});

const PasswordResetConfirmSchema = z.object({
  email: z.string().trim().email().max(254),
  resetToken: z.string().min(1),
  password: z.string().min(6).max(128),
});

const EmailVerificationConfirmSchema = z.object({
  email: z.string().trim().email().max(254),
  verificationToken: z.string().min(1),
});

const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const isTokenMatch = (token: string, expectedHash: string): boolean => {
  const tokenHash = hashToken(token);
  const tokenBuffer = Buffer.from(tokenHash, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  if (tokenBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(tokenBuffer, expectedBuffer);
};

export const createAuthLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Zu viele Anmeldeversuche. Bitte später erneut versuchen.' },
  });

export const createRefreshLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Zu viele Aktualisierungsversuche. Bitte später erneut versuchen.' },
  });

export const createPasswordResetLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Zu viele Passwort-Reset-Anfragen. Bitte später erneut versuchen.' },
  });

export const createEmailVerificationLimiter = () =>
  rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
  });

export function registerAuthRoutes(app: express.Express, deps: AuthRouteDeps) {
  const authLimiter = createAuthLimiter();
  const refreshLimiter = createRefreshLimiter();
  const passwordResetLimiter = createPasswordResetLimiter();
  const emailVerificationLimiter = createEmailVerificationLimiter();

  app.post('/api/v1/auth/register', authLimiter, async (req, res) => {
    const parsed = RegistrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Nutzername, E-Mail-Adresse und Passwort werden benötigt.', details: parsed.error.flatten() });
    }

    const username = normalizeUsername(parsed.data.username);
    const password = parsed.data.password;
    const email = normalizeEmail(parsed.data.email);
    const verificationToken = randomBytes(24).toString('hex');
    const verificationTokenHash = hashToken(verificationToken);
    const verificationExpiresAt = Date.now() + EMAIL_VERIFICATION_TTL_MS;

    try {
      const existingUser = findUserByUsername(deps.db, username);
      if (existingUser) {
        return res.status(409).json({ error: 'Benutzername ist bereits vergeben.' });
      }
      const existingEmail = findUserByEmail(deps.db, email);
      if (existingEmail) {
        return res.status(409).json({ error: 'E-Mail-Adresse ist bereits vergeben.' });
      }
      const passwordHash = await AuthService.hashPassword(password);
      const createdUser = await deps.withFileLock(deps.dbFilePath, async () => {
        if (findUserByUsername(deps.db, username) || findUserByEmail(deps.db, email)) return null;
        const user: StoredUser = {
          id: randomUUID(),
          username,
          email,
          passwordHash,
          displayName: parsed.data.username.trim(),
          role: 'caregiver',
          createdAt: Date.now(),
          emailVerificationTokenHash: verificationTokenHash,
          emailVerificationExpiresAt: verificationExpiresAt,
          emailVerificationSentAt: Date.now(),
        };
        addUser(deps.db, user);
        // Seed symbols for the user's primary profile (using userId as profileId for now as per current app patterns)
        seedProfileSymbols(deps.db, user.id);
        await saveDatabase(deps.db, deps.dbFilePath);
        return user;
      });

      if (!createdUser) {
        return res.status(409).json({ error: 'Benutzername oder E-Mail-Adresse ist bereits vergeben.' });
      }

      await deps.emailService.sendVerificationEmail({
        email: createdUser.email,
        username: createdUser.username,
        token: verificationToken,
      });

      logger.info('User registered (verification required)', {
        userId: createdUser.id,
        username: createdUser.username,
      });
      return res.status(201).json({
        message: 'Registrierung erfolgreich. Bitte bestätige deine E-Mail-Adresse.',
      });
    } catch (error: any) {
      logger.error('Registration failed', { error: error?.message });
      return res.status(500).json({ error: 'Registrierung fehlgeschlagen. E-Mail konnte nicht gesendet werden.' });
    }
  });

  app.post('/api/v1/auth/login', authLimiter, async (req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Nutzername und Passwort werden benötigt.' });
    }

    const username = normalizeUsername(parsed.data.username);
    const password = parsed.data.password;
    try {
      const user = findUserByUsername(deps.db, username);
      const passwordHash = user?.passwordHash ?? AuthService.DUMMY_PASSWORD_HASH;
      const valid = await AuthService.verifyPassword(password, passwordHash);
      if (!user || !valid) {
        return res.status(401).json({ error: 'Ungültige Zugangsdaten.' });
      }

      if (!user.emailVerifiedAt) {
        return res.status(403).json({ error: 'E-Mail-Adresse noch nicht bestätigt. Bitte prüfe deine E-Mails.' });
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

  app.post('/api/v1/auth/refresh', refreshLimiter, async (req, res) => {
    const parsed = RefreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Aktualisierungs-Token wird benötigt.' });
    }

    try {
      const refreshed = AuthService.refreshTokens(parsed.data.refreshToken, (userId) =>
        findUserById(deps.db, userId),
      );

      if (!refreshed) {
        return res.status(401).json({ error: 'Sitzung abgelaufen. Bitte neu anmelden.' });
      }

      logger.info('Tokens refreshed', { userId: refreshed.user.id, username: refreshed.user.username });
      return res.json(refreshed);
    } catch (error: any) {
      logger.error('Token refresh failed', { error: error?.message });
      return res.status(500).json({ error: 'Token-Aktualisierung fehlgeschlagen.' });
    }
  });

  app.post('/api/v1/auth/password-reset/request', passwordResetLimiter, async (req, res) => {
    const parsed = PasswordResetRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'E-Mail-Adresse wird benötigt.' });
    }

    const email = normalizeEmail(parsed.data.email);
    const user = findUserByEmail(deps.db, email);
    if (!user || !user.emailVerifiedAt) {
      return res.status(202).json({
        message: 'Wenn ein Konto existiert, wurde eine E-Mail mit einem Reset-Code gesendet.',
      });
    }

    const resetToken = randomBytes(24).toString('hex');
    const resetTokenHash = hashToken(resetToken);
    const expiresAt = Date.now() + PASSWORD_RESET_TTL_MS;

    try {
      await deps.withFileLock(deps.dbFilePath, async () => {
        const userToUpdate = findUserByEmail(deps.db, email);
        if (!userToUpdate) return;
        userToUpdate.passwordResetTokenHash = resetTokenHash;
        userToUpdate.passwordResetExpiresAt = expiresAt;
        userToUpdate.passwordResetRequestedAt = Date.now();
        await saveDatabase(deps.db, deps.dbFilePath);
      });

      await deps.emailService.sendPasswordResetEmail({
        email: user.email,
        username: user.username,
        token: resetToken,
      });

      logger.info('Password reset requested', { userId: user.id, username: user.username });
      return res.status(202).json({
        message: 'Wenn ein Konto existiert, wurde eine E-Mail mit einem Reset-Code gesendet.',
      });
    } catch (error: any) {
      logger.error('Password reset request failed', { error: error?.message });
      return res.status(500).json({ error: 'Passwort-Reset fehlgeschlagen.' });
    }
  });

  app.post('/api/v1/auth/password-reset/confirm', passwordResetLimiter, async (req, res) => {
    const parsed = PasswordResetConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'E-Mail-Adresse, Reset-Code und neues Passwort werden benötigt.' });
    }

    const email = normalizeEmail(parsed.data.email);
    const { resetToken, password } = parsed.data;

    try {
      const updatedUser = await deps.withFileLock(deps.dbFilePath, async () => {
        const userToUpdate = findUserByEmail(deps.db, email);
        if (!userToUpdate) return null;
        const resetHash = userToUpdate.passwordResetTokenHash;
        const expiresAt = userToUpdate.passwordResetExpiresAt ?? 0;
        const now = Date.now();
        if (!resetHash || expiresAt < now) {
          if (resetHash) {
            userToUpdate.passwordResetTokenHash = undefined;
            userToUpdate.passwordResetExpiresAt = undefined;
            userToUpdate.passwordResetRequestedAt = undefined;
            await saveDatabase(deps.db, deps.dbFilePath);
          }
          return null;
        }

        if (!isTokenMatch(resetToken, resetHash)) {
          return null;
        }

        userToUpdate.passwordHash = await AuthService.hashPassword(password);
        userToUpdate.passwordResetTokenHash = undefined;
        userToUpdate.passwordResetExpiresAt = undefined;
        userToUpdate.passwordResetRequestedAt = undefined;
        await saveDatabase(deps.db, deps.dbFilePath);
        return { id: userToUpdate.id, username: userToUpdate.username };
      });

      if (!updatedUser) {
        return res.status(400).json({ error: 'Ungültiger oder abgelaufener Reset-Code.' });
      }

      logger.info('Password reset confirmed', { userId: updatedUser.id, username: updatedUser.username });
      return res.json({ message: 'Passwort wurde aktualisiert.' });
    } catch (error: any) {
      logger.error('Password reset confirmation failed', { error: error?.message });
      return res.status(500).json({ error: 'Passwort-Reset fehlgeschlagen.' });
    }
  });

  app.post('/api/v1/auth/verify-email/request', emailVerificationLimiter, async (req, res) => {
    const parsed = PasswordResetRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'E-Mail-Adresse wird benötigt.' });
    }

    const email = normalizeEmail(parsed.data.email);
    const user = findUserByEmail(deps.db, email);
    if (!user || user.emailVerifiedAt) {
      return res.status(202).json({
        message: 'Wenn ein Konto existiert, wurde eine E-Mail mit einem Bestätigungscode gesendet.',
      });
    }

    const verificationToken = randomBytes(24).toString('hex');
    const verificationTokenHash = hashToken(verificationToken);
    const verificationExpiresAt = Date.now() + EMAIL_VERIFICATION_TTL_MS;

    try {
      await deps.withFileLock(deps.dbFilePath, async () => {
        const userToUpdate = findUserByEmail(deps.db, email);
        if (!userToUpdate || userToUpdate.emailVerifiedAt) return;
        userToUpdate.emailVerificationTokenHash = verificationTokenHash;
        userToUpdate.emailVerificationExpiresAt = verificationExpiresAt;
        userToUpdate.emailVerificationSentAt = Date.now();
        await saveDatabase(deps.db, deps.dbFilePath);
      });

      await deps.emailService.sendVerificationEmail({
        email: user.email,
        username: user.username,
        token: verificationToken,
      });

      return res.status(202).json({
        message: 'Wenn ein Konto existiert, wurde eine E-Mail mit einem Bestätigungscode gesendet.',
      });
    } catch (error: any) {
      logger.error('Email verification request failed', { error: error?.message });
      return res.status(500).json({ error: 'E-Mail-Bestätigung fehlgeschlagen.' });
    }
  });

  app.post('/api/v1/auth/verify-email/confirm', passwordResetLimiter, async (req, res) => {
    const parsed = EmailVerificationConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'E-Mail-Adresse und Bestätigungscode werden benötigt.' });
    }

    const email = normalizeEmail(parsed.data.email);
    const { verificationToken } = parsed.data;

    try {
      const verifiedUser = await deps.withFileLock(deps.dbFilePath, async () => {
        const userToUpdate = findUserByEmail(deps.db, email);
        if (!userToUpdate) return null;
        const verificationHash = userToUpdate.emailVerificationTokenHash;
        const expiresAt = userToUpdate.emailVerificationExpiresAt ?? 0;
        const now = Date.now();
        if (!verificationHash || expiresAt < now) {
          if (verificationHash) {
            userToUpdate.emailVerificationTokenHash = undefined;
            userToUpdate.emailVerificationExpiresAt = undefined;
            userToUpdate.emailVerificationSentAt = undefined;
            await saveDatabase(deps.db, deps.dbFilePath);
          }
          return null;
        }

        if (!isTokenMatch(verificationToken, verificationHash)) {
          return null;
        }

        userToUpdate.emailVerifiedAt = Date.now();
        userToUpdate.emailVerificationTokenHash = undefined;
        userToUpdate.emailVerificationExpiresAt = undefined;
        userToUpdate.emailVerificationSentAt = undefined;
        await saveDatabase(deps.db, deps.dbFilePath);
        return { id: userToUpdate.id, username: userToUpdate.username };
      });

      if (!verifiedUser) {
        return res.status(400).json({ error: 'Ungültiger oder abgelaufener Bestätigungscode.' });
      }

      logger.info('Email verified', { userId: verifiedUser.id, username: verifiedUser.username });
      return res.json({ message: 'E-Mail-Adresse wurde bestätigt. Du kannst dich jetzt anmelden.' });
    } catch (error: any) {
      logger.error('Email verification failed', { error: error?.message });
      return res.status(500).json({ error: 'E-Mail-Bestätigung fehlgeschlagen.' });
    }
  });
}
