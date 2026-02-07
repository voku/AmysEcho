import type { Express, NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { optionalAuth } from "../middleware/auth.js";
import {
	improveMetacomSentence,
	SentenceImprovementError,
} from "../services/metacomSentenceService.js";
import logger from "../services/logger.js";

type MetacomSentenceRouteDeps = {
	authMiddleware?: (req: Request, res: Response, next: NextFunction) => void;
};

const ImproveSentenceSchema = z.object({
	sentence: z.string().trim().min(1).max(200),
	locale: z.string().optional(),
});

export function registerMetacomSentenceRoutes(
	app: Express,
	deps: MetacomSentenceRouteDeps = {},
): void {
	const limiter = rateLimit({
		windowMs: 15 * 60 * 1000,
		max: 40,
		standardHeaders: true,
		legacyHeaders: false,
		message: {
			error: "Zu viele Anfragen. Bitte versuchen Sie es später erneut.",
		},
	});

	const authMiddleware = deps.authMiddleware ?? optionalAuth;

	app.post(
		"/api/v1/metacom/sentence-improve",
		authMiddleware,
		limiter,
		async (req: Request, res: Response) => {
			if (!req.user) {
				return res.status(401).json({ error: "Bitte zuerst anmelden." });
			}

			const parsed = ImproveSentenceSchema.safeParse(req.body);
			if (!parsed.success) {
				return res.status(400).json({ error: "Ungültige Satzdaten." });
			}

			try {
				const improvedSentence = await improveMetacomSentence({
					sentence: parsed.data.sentence,
					locale: parsed.data.locale,
					userId: req.user?.id,
				});
				return res.status(200).json({ improvedSentence });
			} catch (error) {
				if (error instanceof SentenceImprovementError) {
					return res
						.status(error.statusCode)
						.json({ error: error.message });
				}
				logger.error("Metacom sentence improvement failed", {
					error: error instanceof Error ? error.message : String(error),
				});
				return res
					.status(500)
					.json({ error: "Satzverbesserung konnte nicht abgeschlossen werden." });
			}
		},
	);
}
