import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import config from '../config/index.js';
import { StoredUser, UserRole } from '../types.js';

export interface User {
  id: string;
  username: string;
  role: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  private static readonly JWT_SECRET = config.jwtSecret;
  private static readonly JWT_REFRESH_SECRET = config.jwtRefreshSecret;
  private static readonly SALT_ROUNDS = 12;

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static generateTokens(user: User): AuthTokens {
    const accessToken = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
      },
      this.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id },
      this.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    return { accessToken, refreshToken };
  }

  static verifyAccessToken(token: string): User | null {
    try {
      const payload = jwt.verify(token, this.JWT_SECRET) as any;
      return {
        id: payload.userId,
        username: payload.username,
        role: payload.role,
      };
    } catch {
      return null;
    }
  }

  static verifyRefreshToken(token: string): { userId: string } | null {
    try {
      const payload = jwt.verify(token, this.JWT_REFRESH_SECRET) as any;
      return { userId: payload.userId };
    } catch {
      return null;
    }
  }

  static refreshAccessToken(refreshToken: string): AuthTokens | null {
    const payload = this.verifyRefreshToken(refreshToken);
    if (!payload) return null;

    // In a real app, you'd fetch the user from DB here
    // For now, we'll create a basic user object
    const user: User = {
      id: payload.userId,
      username: 'user', // This should come from DB
      role: 'caregiver', // This should come from DB
    };

    return this.generateTokens(user);
  }

  static toUser(stored: StoredUser): User {
    return { id: stored.id, username: stored.username, role: stored.role };
  }
}