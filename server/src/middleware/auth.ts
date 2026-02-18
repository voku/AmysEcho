import type express from "express";
import { findUserById, type Database } from "../db.js";
import logger from "../services/logger.js";
import { AuthService, type User } from "../services/authService.js";

declare global {
	namespace Express {
		interface Request {
			user?: User;
		}
	}
}

const resolveDbInstance = (req: express.Request): Database | undefined => {
	const db = req.app?.locals?.dbInstance as Database | undefined;
	if (!db && process.env.NODE_ENV !== "test") {
		logger.warn("Auth middleware invoked without dbInstance", {
			path: req.path,
			method: req.method,
		});
	}
	return db;
};

const validateTokenUser = (
	res: express.Response,
	db: Database | undefined,
	user: User,
): boolean => {
	if (!db) {
		if (process.env.NODE_ENV === "test") {
			return true;
		}
		res.status(500).json({ error: "Authentication service unavailable" });
		return false;
	}
	if (user.role === "admin") {
		return true;
	}
	const storedUser = findUserById(db, user.id);
	if (!storedUser) {
		res.status(401).json({ error: "Invalid or expired token" });
		return false;
	}
	return true;
};

export function auth(
	req: express.Request,
	res: express.Response,
	next: express.NextFunction,
) {
	const authHeader = req.headers.authorization;

	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return res
			.status(401)
			.json({ error: "Authorization header missing or invalid" });
	}

	const token = authHeader.substring(7); // Remove 'Bearer ' prefix
	const user = AuthService.verifyAccessToken(token);

	if (!user) {
		return res.status(401).json({ error: "Invalid or expired token" });
	}

	const db = resolveDbInstance(req);
	if (!validateTokenUser(res, db, user)) {
		return;
	}

	req.user = user;
	next();
}

export function optionalAuth(
	req: express.Request,
	_res: express.Response,
	next: express.NextFunction,
) {
	const authHeader = req.headers.authorization;

	if (authHeader && authHeader.startsWith("Bearer ")) {
		const token = authHeader.substring(7);
		const user = AuthService.verifyAccessToken(token);
		if (user) {
			const db = resolveDbInstance(req);
			if (validateTokenUser(_res, db, user)) {
				req.user = user;
			}
		}
	}

	next();
}
export default auth;
