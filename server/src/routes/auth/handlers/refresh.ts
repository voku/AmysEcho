import { type Request, type Response } from 'express';
import { findUserById } from '../../../db.js';
import { AuthService } from '../../../services/authService.js';
import logger from '../../../services/logger.js';
import { RefreshSchema } from '../schemas.js';
import { type AuthRouteDeps } from '../types.js';

/**
 * Handler for POST /api/v1/auth/refresh
 * Refreshes authentication tokens using a valid refresh token
 */
export async function handleRefreshToken(req: Request, res: Response, deps: AuthRouteDeps): Promise<Response> {
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
}
