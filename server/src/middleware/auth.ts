import type express from "express";
import { findUserById, type Database } from "../db.js";
import { AuthService, type User } from "../services/authService.js";

declare global {
	namespace Express {
		interface Request {
			user?: User;
		}
	}
}

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

	
	const db = req.app?.locals?.dbInstance as Database | undefined;
	if (db) {
		const storedUser = findUserById(db, user.id);
		if (!storedUser) {
			return res.status(401).json({ error: "Invalid or expired token" });
		}
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
			req.user = user;
		}
	}

	next();
}
export default auth;
