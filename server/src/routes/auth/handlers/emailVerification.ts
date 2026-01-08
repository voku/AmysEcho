import { randomBytes } from 'crypto';
import { type Request, type Response } from 'express';
import { findUserByEmail, saveDatabase } from '../../../db.js';
import logger from '../../../services/logger.js';
import { EmailVerificationConfirmSchema, EmailVerificationRequestSchema, normalizeEmail } from '../schemas.js';
import { EMAIL_VERIFICATION_TTL_MS, hashToken, isTokenMatch } from '../tokenUtils.js';
import { type AuthRouteDeps } from '../types.js';

/**
 * Handler for POST /api/v1/auth/verify-email/request
 * Sends an email verification token to the user's email
 */
export async function handleEmailVerificationRequest(
  req: Request,
  res: Response,
  deps: AuthRouteDeps,
): Promise<Response> {
  const parsed = EmailVerificationRequestSchema.safeParse(req.body);
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
}

/**
 * Handler for POST /api/v1/auth/verify-email/confirm
 * Confirms an email verification and marks the user's email as verified
 */
export async function handleEmailVerificationConfirm(
  req: Request,
  res: Response,
  deps: AuthRouteDeps,
): Promise<Response> {
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
      
      if (!verificationHash || expiresAt < now || !isTokenMatch(verificationToken, verificationHash)) {
        // If a token was present, clear it to prevent reuse or further attempts
        if (verificationHash) {
          userToUpdate.emailVerificationTokenHash = undefined;
          userToUpdate.emailVerificationExpiresAt = undefined;
          userToUpdate.emailVerificationSentAt = undefined;
          await saveDatabase(deps.db, deps.dbFilePath);
        }
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
}
