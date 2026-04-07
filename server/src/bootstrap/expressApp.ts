import express, {
	type ErrorRequestHandler,
	type Express,
	type Request,
	type Response,
} from "express";
import config from "../config/index.js";
import { hstsHeaders, httpsEnforcement } from "../middleware/httpsEnforcement.js";
import logger from "../services/logger.js";

const DEV_ORIGINS = new Set([
	"http://localhost:5173",
	"http://127.0.0.1:5173",
	"http://localhost:4173",
	"http://127.0.0.1:4173",
	"http://localhost:3000",
	"http://127.0.0.1:3000",
]);

export function createConfiguredApp(): Express {
	const app = express();

	// Trust first proxy (Nginx) to correctly handle X-Forwarded-Proto.
	app.set("trust proxy", 1);

	// Security middleware must run before body parsing and routes.
	app.use(httpsEnforcement);
	app.use(hstsHeaders);

	if (process.env.NODE_ENV !== "production") {
		app.use((req, res, next) => {
			const origin = req.headers.origin;
			if (origin && DEV_ORIGINS.has(origin)) {
				res.setHeader("Access-Control-Allow-Origin", origin);
				res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
				res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, If-None-Match");
				res.setHeader("Access-Control-Allow-Credentials", "true");
				res.setHeader("Access-Control-Expose-Headers", "ETag, X-Model-Feature-Mode, X-Model-Label-Count, X-Model-Contract-Status");
				// Preflight requests complete here; no next() needed.
				if (req.method === "OPTIONS") {
					res.sendStatus(204);
					return;
				}
			}
			next();
		});
	}

	// Increase JSON body size limit to accommodate base64 images from the app.
	app.use(express.json({ limit: "8mb" }));
	app.use(express.urlencoded({ extended: true, limit: "8mb" }));

	return app;
}

export const errorHandler: ErrorRequestHandler = (
	error: unknown,
	req: Request,
	res: Response,
	_next,
) => {
	const errorRecord = error as {
		statusCode?: number;
		message?: string;
		stack?: string;
	};
	const statusCode =
		typeof errorRecord.statusCode === "number" ? errorRecord.statusCode : 500;
	const message =
		typeof errorRecord.message === "string"
			? errorRecord.message
			: "Internal server error";

	logger.error(
		"Request error",
		{
			method: req.method,
			path: req.path,
			message: errorRecord.message,
			stack: errorRecord.stack,
			statusCode,
			url: req.url,
			userAgent: req.get("User-Agent"),
		},
		req.user?.id,
	);

	res.status(statusCode).json({
		error: statusCode === 500 ? "Internal server error" : message,
		...(config.nodeEnv === "development" && { details: message }),
	});
};
