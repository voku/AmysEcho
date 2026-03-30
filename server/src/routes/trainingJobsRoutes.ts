import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";

type TrainStatus = "queued" | "running" | "completed" | "failed";

export interface TrainingJob {
	id: string;
	status: TrainStatus;
	progress: number;
	queueDepth?: number;
	retryAfterMs?: number;
	error?: string;
	startedAt?: number;
	endedAt?: number;
	metrics?: Record<string, unknown>;
	report?: Record<string, unknown>;
	message?: string;
}

interface TrainingSample {
	signId: string;
	profileId?: string | null;
	landmarkData:
		| [number, number, number][]
		| {
				timestampMs: number;
				landmarks: [number, number, number][];
				poseLandmarks?: number[][];
				faceLandmarks?: number[][];
		  }[];
}

interface RegisterTrainingJobsRoutesDeps {
	authMiddleware: RequestHandler;
	trainingLimiter: RequestHandler;
	healthLimiter: RequestHandler;
	landmarkTupleSchema: z.ZodType<[number, number, number]>;
	frameSchema: z.ZodType<{
		timestampMs: number;
		landmarks: [number, number, number][];
		poseLandmarks?: number[][];
		faceLandmarks?: number[][];
	}>;
	handLandmarksPerHand: number;
	totalHandLandmarks: number;
	multimodalLandmarks: number;
	startTrainingJob: (
		samples: TrainingSample[],
		trigger: "bundles" | null,
	) => {
		jobId: string;
		status: TrainStatus;
		queueDepth: number;
		retryAfterMs: number;
	};
	trainingJobs: Map<string, TrainingJob>;
	isProfileAuthorized: (req: Request, profileId: string) => boolean;
}

export function registerTrainingJobsRoutes(
	app: Express,
	deps: RegisterTrainingJobsRoutesDeps,
): void {
	const SampleSchema = z.object({
		signId: z.string().min(1),
		profileId: z.string().optional(),
		landmarkData: z.union([
			z
				.array(deps.landmarkTupleSchema)
				.refine(
					(arr) =>
						arr.length === deps.handLandmarksPerHand ||
						arr.length === deps.totalHandLandmarks ||
						arr.length === deps.multimodalLandmarks,
					{
						message: "Landmarken müssen 21, 42 oder 543 Punkte enthalten",
					},
				),
			z
				.array(deps.frameSchema)
				.refine(
					(frames) =>
						frames.every(
							(frame) =>
								frame.landmarks.length === deps.handLandmarksPerHand ||
								frame.landmarks.length === deps.totalHandLandmarks ||
								frame.landmarks.length === deps.multimodalLandmarks,
						),
					{
						message: "Jeder Frame muss 21, 42 oder 543 Landmarken enthalten",
					},
				),
		]),
	});
	const BodySchema = z.object({
		samples: z.array(SampleSchema).optional(),
		trigger: z.enum(["bundles"]).optional(),
	});

	app.post(
		"/api/v1/train-model",
		deps.authMiddleware,
		deps.trainingLimiter,
		async (req: Request, res: Response) => {
			const parsed = BodySchema.safeParse(req.body);
			if (!parsed.success) {
				return res.status(400).json({
					error: "Ungültige Trainingsdaten.",
					details: parsed.error.flatten(),
				});
			}

			type Sample = z.infer<typeof SampleSchema>;
			const samples: Sample[] = parsed.data.samples ?? [];
			const triggeredByBundles = parsed.data.trigger === "bundles";
			if (samples.length === 0 && !triggeredByBundles) {
				return res.status(400).json({ error: "Samples-Liste darf nicht leer sein." });
			}

			for (const sample of samples) {
				if (sample.profileId && !deps.isProfileAuthorized(req, sample.profileId)) {
					return res.status(403).json({ error: "Zugriff auf Profil verweigert." });
				}
			}

			const trainingSamples: TrainingSample[] = samples.map((sample) => ({
				signId: sample.signId,
				profileId: sample.profileId ?? null,
				landmarkData: sample.landmarkData,
			}));

			const { jobId, status, queueDepth, retryAfterMs } = deps.startTrainingJob(
				trainingSamples,
				triggeredByBundles ? "bundles" : null,
			);

			const message =
				status === "queued"
					? "Trainingsauftrag wurde in die Warteschlange gestellt"
					: "Trainingsauftrag gestartet";

			if (retryAfterMs > 0) {
				res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000).toString());
			}

			res.status(202).json({
				status,
				jobId,
				pollUrl: `/api/v1/train-status/${jobId}`,
				message,
				queueDepth,
				...(retryAfterMs > 0 ? { retryAfterMs } : {}),
			});
		},
	);

	app.get(
		"/api/v1/train-status/:id",
		deps.authMiddleware,
		deps.healthLimiter,
		(req: Request, res: Response) => {
			const id = req.params.id;
			const job = deps.trainingJobs.get(id);
			if (!job) {
				return res.status(404).json({ id, status: "not_found" });
			}
			res.json(job);
		},
	);

	app.get(
		"/api/v1/train-status",
		deps.authMiddleware,
		deps.healthLimiter,
		(_req: Request, res: Response) => {
			res.status(400).json({ error: "Training-Job-ID ist erforderlich." });
		},
	);
}
