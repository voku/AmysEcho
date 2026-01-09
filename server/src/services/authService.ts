import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import config from "../config/index.js";
import type { StoredUser, UserRole } from "../types.js";

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
	static readonly DUMMY_PASSWORD_HASH = bcrypt.hashSync(
		"dummy-password",
		this.SALT_ROUNDS,
	);

	static async hashPassword(password: string): Promise<string> {
		return bcrypt.hash(password, AuthService.SALT_ROUNDS);
	}

	static async verifyPassword(
		password: string,
		hash: string,
	): Promise<boolean> {
		return bcrypt.compare(password, hash);
	}

	static generateTokens(user: User): AuthTokens {
		const accessToken = jwt.sign(
			{
				userId: user.id,
				username: user.username,
				role: user.role,
			},
			AuthService.JWT_SECRET,
			{ expiresIn: "15m" },
		);

		const refreshToken = jwt.sign(
			{ userId: user.id },
			AuthService.JWT_REFRESH_SECRET,
			{ expiresIn: "7d" },
		);

		return { accessToken, refreshToken };
	}

	static verifyAccessToken(token: string): User | null {
		try {
			const payload = jwt.verify(token, AuthService.JWT_SECRET) as any;
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
			const payload = jwt.verify(token, AuthService.JWT_REFRESH_SECRET) as any;
			return { userId: payload.userId };
		} catch {
			return null;
		}
	}

	static refreshTokens(
		refreshToken: string,
		getUserById: (id: string) => StoredUser | undefined,
	): { user: User; tokens: AuthTokens } | null {
		const payload = AuthService.verifyRefreshToken(refreshToken);
		if (!payload) return null;

		const storedUser = getUserById(payload.userId);
		if (!storedUser) return null;

		const user = AuthService.toUser(storedUser);
		const tokens = AuthService.generateTokens(user);

		return { user, tokens };
	}

	static toUser(stored: StoredUser): User {
		return { id: stored.id, username: stored.username, role: stored.role };
	}
}
