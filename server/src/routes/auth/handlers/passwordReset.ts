import { randomBytes } from 'crypto';
import { type Request, type Response } from 'express';
import { findUserByEmail, saveDatabase } from '../../../db.js';
import { AuthService } from '../../../services/authService.js';
import logger from '../../../services/logger.js';
import { normalizeEmail, PasswordResetConfirmSchema, PasswordResetRequestSchema } from '../schemas.js';
import { hashToken, isTokenMatch, PASSWORD_RESET_TTL_MS } from '../tokenUtils.js';
import { type AuthRouteDeps } from '../types.js';

/**
 * Handler for POST /api/v1/auth/password-reset/request
 * Sends a password reset token to the user's email
 */
export async function handlePasswordResetRequest(req: Request, res: Response, deps: AuthRouteDeps): Promise<Response> {
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
}

/**
 * Handler for POST /api/v1/auth/password-reset/confirm
 * Confirms a password reset and updates the user's password
 */
export async function handlePasswordResetConfirm(req: Request, res: Response, deps: AuthRouteDeps): Promise<Response> {
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
}
