import { createHash, timingSafeEqual } from "crypto";
import type { StoredUser } from "../../types.js";

/**
 * Time-to-live constants for authentication tokens
 */
export const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Hash a token using SHA-256
 * @param token - The plain text token to hash
 * @returns The hex-encoded hash
 */
export const hashToken = (token: string): string => {
	return createHash("sha256").update(token).digest("hex");
};

/**
 * Securely compare a token against its expected hash using timing-safe comparison
 * @param token - The plain text token to verify
 * @param expectedHash - The expected hash value
 * @returns True if the token matches the hash
 */
export const isTokenMatch = (token: string, expectedHash: string): boolean => {
	const tokenHash = hashToken(token);
	const tokenBuffer = Buffer.from(tokenHash, "hex");
	const expectedBuffer = Buffer.from(expectedHash, "hex");

	if (tokenBuffer.length !== expectedBuffer.length) {
		return false;
	}

	return timingSafeEqual(tokenBuffer, expectedBuffer);
};

/**
 * Clear email verification token fields from a user object
 * @param user - The user object to update
 */
export const clearEmailVerificationToken = (user: StoredUser): void => {
	user.emailVerificationTokenHash = undefined;
	user.emailVerificationExpiresAt = undefined;
	user.emailVerificationSentAt = undefined;
};

/**
 * Clear password reset token fields from a user object
 * @param user - The user object to update
 */
export const clearPasswordResetToken = (user: StoredUser): void => {
	user.passwordResetTokenHash = undefined;
	user.passwordResetExpiresAt = undefined;
	user.passwordResetRequestedAt = undefined;
};
