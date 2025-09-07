import express from 'express';
import { AuthService, User } from '../services/authService.js';
import config from '../config/index.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or invalid' });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const user = AuthService.verifyAccessToken(token);

  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  next();
}

export function optionalAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const user = AuthService.verifyAccessToken(token);
    if (user) {
      req.user = user;
    }
  }

  next();
}

// Legacy auth for backwards compatibility (can be removed later)
export function legacyAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization;
  if (header === `Bearer ${config.apiToken}`) {
    // Create a legacy user for backwards compatibility
    req.user = {
      id: 'legacy-user',
      username: 'legacy',
      role: 'caregiver',
    };
    return next();
  }

  // If not legacy token, try JWT
  return auth(req, res, next);
}

export default auth;
