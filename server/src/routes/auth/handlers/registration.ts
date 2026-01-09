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
    const passwordHash = await AuthService.hashPassword(password);
    const result = await deps.withFileLock(deps.dbFilePath, async () => {
      const existingUsername = findUserByUsername(deps.db, username);
      const existingEmail = findUserByEmail(deps.db, email);
      
      if (existingUsername) {
        return { error: 'username' };
      }
      if (existingEmail) {
        return { error: 'email' };
      }
      
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
      return { user };
    });

    if ('error' in result) {
      if (result.error === 'username') {
        return res.status(409).json({ error: 'Benutzername ist bereits vergeben.' });
      }
      // At this point, the only other error is 'email'
      return res.status(409).json({ error: 'E-Mail-Adresse ist bereits vergeben.' });
    }

    await deps.emailService.sendVerificationEmail({
      email: result.user.email,
      username: result.user.username,
      token: verificationToken,
    });

    logger.info('User registered (verification required)', {
      userId: result.user.id,
      username: result.user.username,
    });
    
    return res.status(201).json({
      message: 'Registrierung erfolgreich. Bitte bestätige deine E-Mail-Adresse.',
    });
  } catch (error: any) {
    logger.error('Registration failed', { error: error?.message });
    return res.status(500).json({ error: 'Registrierung fehlgeschlagen. E-Mail konnte nicht gesendet werden.' });
  }
}
