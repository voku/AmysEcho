import { type Request, type Response } from 'express';
import { findUserByUsername } from '../../../db.js';
import { AuthService } from '../../../services/authService.js';
import logger from '../../../services/logger.js';
import { LoginSchema, normalizeUsername } from '../schemas.js';
import { type AuthRouteDeps } from '../types.js';

/**
 * Handler for POST /api/v1/auth/login
 * Authenticates a user and returns access/refresh tokens
 */
export async function handleLogin(req: Request, res: Response, deps: AuthRouteDeps): Promise<Response> {
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
}
