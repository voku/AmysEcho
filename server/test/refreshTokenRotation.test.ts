/**
 * Tests for refresh token rotation security feature
 */

import { AuthService } from "../src/services/authService";
import type { StoredUser } from "../src/types";

describe("Refresh Token Rotation", () => {
	const createMockUser = (overrides: Partial<StoredUser> = {}): StoredUser => ({
		id: "user-123",
		username: "testuser",
		email: "test@example.com",
		passwordHash: "hash",
		role: "caregiver",
		createdAt: Date.now(),
		...overrides,
	});

	describe("generateTokens", () => {
		it("should return access token, refresh token, and refresh token hash", () => {
			const user = { id: "user-1", username: "test", role: "caregiver" as const };
			const tokens = AuthService.generateTokens(user);

			expect(tokens.accessToken).toBeDefined();
			expect(tokens.refreshToken).toBeDefined();
			expect(tokens.refreshTokenHash).toBeDefined();
			expect(tokens.refreshTokenHash.length).toBe(64); // SHA-256 hex is 64 chars
		});

		it("should generate different tokens on each call", () => {
			const user = { id: "user-1", username: "test", role: "caregiver" as const };
			const tokens1 = AuthService.generateTokens(user);
			const tokens2 = AuthService.generateTokens(user);

			expect(tokens1.refreshToken).not.toBe(tokens2.refreshToken);
			expect(tokens1.refreshTokenHash).not.toBe(tokens2.refreshTokenHash);
		});
	});

	describe("hashRefreshToken", () => {
		it("should return consistent hash for same token", () => {
			const token = "test-token-12345";
			const hash1 = AuthService.hashRefreshToken(token);
			const hash2 = AuthService.hashRefreshToken(token);

			expect(hash1).toBe(hash2);
		});

		it("should return different hashes for different tokens", () => {
			const hash1 = AuthService.hashRefreshToken("token-1");
			const hash2 = AuthService.hashRefreshToken("token-2");

			expect(hash1).not.toBe(hash2);
		});
	});

	describe("refreshTokensWithRotation", () => {
		it("should not expose the deprecated non-rotating refresh helper", () => {
			expect(
				Object.prototype.hasOwnProperty.call(AuthService, "refreshTokens"),
			).toBe(false);
		});

		it("should refresh tokens when hash matches", () => {
			const user = { id: "user-1", username: "test", role: "caregiver" as const };
			const originalTokens = AuthService.generateTokens(user);
			
			const storedUser = createMockUser({
				id: user.id,
				username: user.username,
				refreshTokenHash: originalTokens.refreshTokenHash,
			});

			const result = AuthService.refreshTokensWithRotation(
				originalTokens.refreshToken,
				() => storedUser,
			);

			expect(result).not.toBeNull();
			expect(result!.user.id).toBe(user.id);
			expect(result!.tokens.accessToken).toBeDefined();
			expect(result!.tokens.refreshToken).toBeDefined();
			expect(result!.newRefreshTokenHash).toBeDefined();
			// New hash should be different (rotation)
			expect(result!.newRefreshTokenHash).not.toBe(originalTokens.refreshTokenHash);
		});

		it("should reject tokens that have already been rotated", () => {
			const user = { id: "user-1", username: "test", role: "caregiver" as const };
			const originalTokens = AuthService.generateTokens(user);
			const newTokens = AuthService.generateTokens(user);
			
			// User has a different (newer) token hash stored
			const storedUser = createMockUser({
				id: user.id,
				refreshTokenHash: newTokens.refreshTokenHash,
			});

			// Try to use the old token
			const result = AuthService.refreshTokensWithRotation(
				originalTokens.refreshToken,
				() => storedUser,
			);

			// Should be rejected (token was already rotated)
			expect(result).toBeNull();
		});

		it("should allow refresh when no hash is stored (first rotation)", () => {
			const user = { id: "user-1", username: "test", role: "caregiver" as const };
			const originalTokens = AuthService.generateTokens(user);
			
			// User has no stored refresh token hash (legacy user or first login)
			const storedUser = createMockUser({
				id: user.id,
				refreshTokenHash: undefined,
			});

			const result = AuthService.refreshTokensWithRotation(
				originalTokens.refreshToken,
				() => storedUser,
			);

			expect(result).not.toBeNull();
			expect(result!.newRefreshTokenHash).toBeDefined();
		});

		it("should reject invalid/expired tokens", () => {
			const storedUser = createMockUser();

			const result = AuthService.refreshTokensWithRotation(
				"invalid-token",
				() => storedUser,
			);

			expect(result).toBeNull();
		});

		it("should reject tokens for non-existent users", () => {
			const user = { id: "user-1", username: "test", role: "caregiver" as const };
			const tokens = AuthService.generateTokens(user);

			const result = AuthService.refreshTokensWithRotation(
				tokens.refreshToken,
				() => undefined, // User not found
			);

			expect(result).toBeNull();
		});
	});

	describe("Security: Token Replay Attack Prevention", () => {
		it("should prevent reuse of rotated tokens", () => {
			const user = { id: "user-1", username: "test", role: "caregiver" as const };
			const tokens = AuthService.generateTokens(user);
			
			let storedUser = createMockUser({
				id: user.id,
				refreshTokenHash: tokens.refreshTokenHash,
			});

			// First refresh succeeds
			const result1 = AuthService.refreshTokensWithRotation(
				tokens.refreshToken,
				() => storedUser,
			);
			expect(result1).not.toBeNull();

			// Simulate storing the new hash
			storedUser = { ...storedUser, refreshTokenHash: result1!.newRefreshTokenHash };

			// Attacker tries to reuse the old token
			const attackResult = AuthService.refreshTokensWithRotation(
				tokens.refreshToken, // Using OLD token
				() => storedUser,
			);

			// Attack should fail - token was already rotated
			expect(attackResult).toBeNull();
		});
	});
});
