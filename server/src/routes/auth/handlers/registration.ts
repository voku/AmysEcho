import { randomBytes, randomUUID } from 'crypto';
import { type Request, type Response } from 'express';
import {
  addUser,
  findUserByEmail,
  findUserByUsername,
  saveDatabase,
  seedProfileSymbols,
} from '../../../db.js';
import { AuthService } from '../../../services/authService.js';
import logger from '../../../services/logger.js';
import { type StoredUser } from '../../../types.js';
import { normalizeEmail, normalizeUsername, RegistrationSchema } from '../schemas.js';
import { EMAIL_VERIFICATION_TTL_MS, hashToken } from '../tokenUtils.js';
import { type AuthRouteDeps } from '../types.js';

/**
 * Handler for POST /api/v1/auth/register
 * Creates a new user account and sends an email verification token
 */
export async function handleRegistration(req: Request, res: Response, deps: AuthRouteDeps): Promise<Response> {
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
}
