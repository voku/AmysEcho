import type express from "express";
import {
	handleEmailVerificationConfirm,
	handleEmailVerificationRequest,
	handleLogin,
	handlePasswordResetConfirm,
	handlePasswordResetRequest,
	handleRefreshToken,
	handleRegistration,
} from "./auth/handlers/index.js";
import {
	createAuthLimiter,
	createEmailVerificationLimiter,
	createPasswordResetLimiter,
	createRefreshLimiter,
} from "./auth/rateLimiters.js";
import type { AuthRouteDeps } from "./auth/types.js";

/**
 * Register all authentication routes
 * @param app - Express application instance
 * @param deps - Authentication route dependencies
 */
export function registerAuthRoutes(
	app: express.Express,
	deps: AuthRouteDeps,
): void {
	const authLimiter = createAuthLimiter();
	const refreshLimiter = createRefreshLimiter();
	const passwordResetLimiter = createPasswordResetLimiter();
	const emailVerificationLimiter = createEmailVerificationLimiter();

	// Registration endpoint
	app.post("/api/v1/auth/register", authLimiter, async (req, res) => {
		await handleRegistration(req, res, deps);
	});

	// Login endpoint
	app.post("/api/v1/auth/login", authLimiter, async (req, res) => {
		await handleLogin(req, res, deps);
	});

	// Token refresh endpoint
	app.post("/api/v1/auth/refresh", refreshLimiter, async (req, res) => {
		await handleRefreshToken(req, res, deps);
	});

	// Password reset endpoints
	app.post(
		"/api/v1/auth/password-reset/request",
		passwordResetLimiter,
		async (req, res) => {
			await handlePasswordResetRequest(req, res, deps);
		},
	);

	app.post(
		"/api/v1/auth/password-reset/confirm",
		passwordResetLimiter,
		async (req, res) => {
			await handlePasswordResetConfirm(req, res, deps);
		},
	);

	// Email verification endpoints
	app.post(
		"/api/v1/auth/verify-email/request",
		emailVerificationLimiter,
		async (req, res) => {
			await handleEmailVerificationRequest(req, res, deps);
		},
	);

	app.post(
		"/api/v1/auth/verify-email/confirm",
		emailVerificationLimiter,
		async (req, res) => {
			await handleEmailVerificationConfirm(req, res, deps);
		},
	);
}
