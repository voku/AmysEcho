import bcrypt from "bcrypt";
import { createHash, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import config from "../config/index.js";
import type { StoredUser, UserRole } from "../types.js";

export interface User {
	id: string;
	username: string;
	role: UserRole;
}

interface AccessTokenPayload extends jwt.JwtPayload {
	userId?: string;
	username?: string;
	role?: UserRole;
}

interface RefreshTokenPayload extends jwt.JwtPayload {
	userId?: string;
}

export interface AuthTokens {
	accessToken: string;
	refreshToken: string;
}

/**
 * Result of refresh token rotation.
 * Includes a callback to persist the new token hash.
 */
export interface RefreshResult {
	user: User;
	tokens: AuthTokens;
	/** Hash of the new refresh token - must be stored on the user record */
	newRefreshTokenHash: string;
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

	/**
	 * Generate a SHA-256 hash of a refresh token.
	 * Used for secure storage and comparison of refresh tokens.
	 */
	static hashRefreshToken(token: string): string {
		return createHash("sha256").update(token).digest("hex");
	}

	/**
	 * Generate authentication tokens for a user.
	 * Returns both tokens and the refresh token hash for storage.
	 * 
	 * The jti (JWT ID) claim is added to make each refresh token unique for hashing.
	 * We don't validate jti separately because the hash comparison provides
	 * equivalent protection: if an attacker tries to use a token after rotation,
	 * the hash won't match regardless of jti. The hash is sufficient because:
	 * 1. It includes the jti (token is hashed as a whole)
	 * 2. It's stored and verified on each refresh
	 * 3. Rotation invalidates the old hash, making old tokens unusable
	 */
	static generateTokens(user: User): AuthTokens & { refreshTokenHash: string } {
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
			{ userId: user.id, jti: randomBytes(16).toString("hex") },
			AuthService.JWT_REFRESH_SECRET,
			{ expiresIn: "7d" },
		);

		const refreshTokenHash = AuthService.hashRefreshToken(refreshToken);

		return { accessToken, refreshToken, refreshTokenHash };
	}

	static verifyAccessToken(token: string): User | null {
		try {
			const decoded = jwt.verify(token, AuthService.JWT_SECRET);
			if (typeof decoded === "string") {
				return null;
			}
			const payload = decoded as AccessTokenPayload;
			if (
				typeof payload.userId !== "string" ||
				typeof payload.username !== "string" ||
				(payload.role !== "admin" &&
					payload.role !== "caregiver" &&
					payload.role !== "user")
			) {
				return null;
			}
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
			const decoded = jwt.verify(token, AuthService.JWT_REFRESH_SECRET);
			if (typeof decoded === "string") {
				return null;
			}
			const payload = decoded as RefreshTokenPayload;
			if (typeof payload.userId !== "string") {
				return null;
			}
			return { userId: payload.userId };
		} catch {
			return null;
		}
	}

	/**
	 * Refresh tokens with rotation.
	 * 
	 * Token rotation security:
	 * 1. Validates the provided refresh token is cryptographically valid
	 * 2. Verifies the token hash matches what's stored for the user
	 * 3. Generates a new refresh token (invalidating the old one)
	 * 4. Returns the new token hash for the caller to persist
	 * 
	 * If an attacker uses a stolen refresh token after the legitimate user
	 * has already rotated it, the hash won't match and the request is rejected.
	 * 
	 * @param refreshToken - The refresh token to validate
	 * @param getUserById - Function to retrieve user by ID
	 * @returns RefreshResult with new tokens, or null if invalid
	 */
	static refreshTokensWithRotation(
		refreshToken: string,
		getUserById: (id: string) => StoredUser | undefined,
	): RefreshResult | null {
		// Step 1: Verify JWT signature and expiration
		const payload = AuthService.verifyRefreshToken(refreshToken);
		if (!payload) return null;

		// Step 2: Get user and verify token hash matches stored hash
		const storedUser = getUserById(payload.userId);
		if (!storedUser) return null;

		// Step 3: Verify the token hash matches (rotation check)
		// If the user has a stored refresh token hash, verify it matches
		const currentHash = AuthService.hashRefreshToken(refreshToken);
		if (storedUser.refreshTokenHash && storedUser.refreshTokenHash !== currentHash) {
			// Token was already rotated - this could be a replay attack
			// Log this as a security event (caller should handle)
			return null;
		}

		// Step 4: Generate new tokens (rotation)
		const user = AuthService.toUser(storedUser);
		const tokens = AuthService.generateTokens(user);

		return {
			user,
			tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
			newRefreshTokenHash: tokens.refreshTokenHash,
		};
	}

	/**
	 * Legacy refresh without rotation (for backwards compatibility).
	 * @deprecated Use refreshTokensWithRotation for better security
	 */
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

		return { user, tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken } };
	}

	static toUser(stored: StoredUser): User {
		return { id: stored.id, username: stored.username, role: stored.role };
	}
}
