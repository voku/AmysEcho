import express, {
	type Express,
	type NextFunction,
	type Request,
	type Response,
} from "express";
import { existsSync } from "fs";
import path from "path";
import { SERVER_DIR } from "../constants/modelPaths.js";

const DEFAULT_WEBAPP_DIR = path.join(SERVER_DIR, "public");
const RESERVED_BACKEND_PREFIXES = [
	"/api",
	"/health",
	"/data",
	"/uploads",
	"/models",
	"/server",
];

function resolveRequestedWebappDir(
	env: NodeJS.ProcessEnv = process.env,
): string {
	const configuredDir = env.AMY_ECHO_WEBAPP_DIR?.trim();
	return path.resolve(configuredDir || DEFAULT_WEBAPP_DIR);
}

function shouldServeSpaFallback(req: Request): boolean {
	if (req.method !== "GET" && req.method !== "HEAD") {
		return false;
	}

	// Backend and private runtime namespaces must stay as API/404 responses and
	// must never fall through to the SPA shell.
	if (RESERVED_BACKEND_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
		return false;
	}

	const lastSegment = req.path.split("/").filter(Boolean).pop();
	if (lastSegment?.startsWith(".")) {
		return false;
	}

	return path.extname(req.path) === "";
}

function setStaticCacheHeaders(
	res: Response,
	filePath: string,
	webappDir: string,
): void {
	const relativePath = path.relative(webappDir, filePath).split(path.sep).join("/");

	if (relativePath === "index.html") {
		res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
		res.setHeader("Pragma", "no-cache");
		res.setHeader("Expires", "0");
		return;
	}

	if (relativePath.startsWith("assets/")) {
		res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
		return;
	}

	res.setHeader("Cache-Control", "public, max-age=3600");
}

export function resolveWebappDir(
	env: NodeJS.ProcessEnv = process.env,
): string {
	return resolveRequestedWebappDir(env);
}

export function registerStaticWebapp(
	app: Express,
	options: { webappDir?: string } = {},
): boolean {
	const webappDir = path.resolve(options.webappDir || resolveRequestedWebappDir());
	const indexPath = path.join(webappDir, "index.html");

	if (!existsSync(indexPath)) {
		return false;
	}

	app.use(express.static(webappDir, {
		dotfiles: "ignore",
		fallthrough: true,
		index: false,
		setHeaders: (res, filePath) => {
			setStaticCacheHeaders(res, filePath, webappDir);
		},
	}));

	app.use((req: Request, res: Response, next: NextFunction) => {
		if (!shouldServeSpaFallback(req)) {
			next();
			return;
		}

		setStaticCacheHeaders(res, indexPath, webappDir);
		res.sendFile(indexPath);
	});

	return true;
}
