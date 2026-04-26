import express from "express";
import request from "supertest";
import { z } from "zod";
import {
	registerTrainingJobsRoutes,
	type TrainingJob,
} from "../src/routes/trainingJobsRoutes.js";

describe("registerTrainingJobsRoutes", () => {
	it("creates a training job and returns queue metadata", async () => {
		const app = express();
		app.use(express.json());
		const trainingJobs = new Map<string, TrainingJob>();

		registerTrainingJobsRoutes(app, {
			authMiddleware: (_req, _res, next) => next(),
			trainingLimiter: (_req, _res, next) => next(),
			healthLimiter: (_req, _res, next) => next(),
			landmarkTupleSchema: z.tuple([z.number(), z.number(), z.number()]),
			frameSchema: z.object({
				timestampMs: z.number(),
				landmarks: z.array(z.tuple([z.number(), z.number(), z.number()])),
			}),
			handLandmarksPerHand: 21,
			totalHandLandmarks: 42,
			multimodalLandmarks: 543,
			startTrainingJob: () => ({
				jobId: "job-1",
				status: "queued",
				queueDepth: 2,
				retryAfterMs: 1500,
			}),
			trainingJobs,
			isProfileAuthorized: () => true,
		});

		const response = await request(app)
			.post("/api/v1/train-model")
			.send({
				samples: [
					{
						signId: "essen",
						landmarkData: Array.from({ length: 21 }, () => [0.1, 0.2, 0.3]),
					},
				],
			})
			.expect(202);

		expect(response.body).toMatchObject({
			jobId: "job-1",
			status: "queued",
			queueDepth: 2,
			retryAfterMs: 1500,
			pollUrl: "/api/v1/train-status/job-1",
		});
		expect(response.headers["retry-after"]).toBe("2");
	});

	it("returns 403 when profile authorization fails", async () => {
		const app = express();
		app.use(express.json());

		registerTrainingJobsRoutes(app, {
			authMiddleware: (_req, _res, next) => next(),
			trainingLimiter: (_req, _res, next) => next(),
			healthLimiter: (_req, _res, next) => next(),
			landmarkTupleSchema: z.tuple([z.number(), z.number(), z.number()]),
			frameSchema: z.object({
				timestampMs: z.number(),
				landmarks: z.array(z.tuple([z.number(), z.number(), z.number()])),
			}),
			handLandmarksPerHand: 21,
			totalHandLandmarks: 42,
			multimodalLandmarks: 543,
			startTrainingJob: () => ({
				jobId: "job-2",
				status: "running",
				queueDepth: 0,
				retryAfterMs: 0,
			}),
			trainingJobs: new Map(),
			isProfileAuthorized: () => false,
		});

		await request(app)
			.post("/api/v1/train-model")
			.send({
				samples: [
					{
						signId: "essen",
						profileId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
						landmarkData: Array.from({ length: 21 }, () => [0.1, 0.2, 0.3]),
					},
				],
			})
			.expect(403);
	});

	it("returns the latest post-training cadence summary when configured", async () => {
		const app = express();
		app.use(express.json());

		registerTrainingJobsRoutes(app, {
			authMiddleware: (_req, _res, next) => next(),
			trainingLimiter: (_req, _res, next) => next(),
			healthLimiter: (_req, _res, next) => next(),
			landmarkTupleSchema: z.tuple([z.number(), z.number(), z.number()]),
			frameSchema: z.object({
				timestampMs: z.number(),
				landmarks: z.array(z.tuple([z.number(), z.number(), z.number()])),
			}),
			handLandmarksPerHand: 21,
			totalHandLandmarks: 42,
			multimodalLandmarks: 543,
			startTrainingJob: () => ({
				jobId: "job-3",
				status: "running",
				queueDepth: 0,
				retryAfterMs: 0,
			}),
			trainingJobs: new Map(),
			getLatestPostTrainingCadenceSummary: async () => ({
				generatedAt: "2026-04-06T12:00:00.000Z",
				dryRun: true,
			}),
			isProfileAuthorized: () => true,
		});

		const response = await request(app)
			.get("/api/v1/train-status/cadence/latest")
			.expect(200);

		expect(response.body).toMatchObject({
			generatedAt: "2026-04-06T12:00:00.000Z",
			dryRun: true,
		});
	});

	it("returns 404 when the requested training job is unknown", async () => {
		const app = express();
		app.use(express.json());

		registerTrainingJobsRoutes(app, {
			authMiddleware: (_req, _res, next) => next(),
			trainingLimiter: (_req, _res, next) => next(),
			healthLimiter: (_req, _res, next) => next(),
			landmarkTupleSchema: z.tuple([z.number(), z.number(), z.number()]),
			frameSchema: z.object({
				timestampMs: z.number(),
				landmarks: z.array(z.tuple([z.number(), z.number(), z.number()])),
			}),
			handLandmarksPerHand: 21,
			totalHandLandmarks: 42,
			multimodalLandmarks: 543,
			startTrainingJob: () => ({
				jobId: "job-exists",
				status: "queued",
				queueDepth: 0,
				retryAfterMs: 0,
			}),
			trainingJobs: new Map(),
			isProfileAuthorized: () => true,
		});

		const response = await request(app)
			.get("/api/v1/train-status/job-missing")
			.expect(404);

		expect(response.body).toEqual({ id: "job-missing", status: "not_found" });
	});

	it("returns the stored training job payload for status lookups", async () => {
		const app = express();
		app.use(express.json());
		const trainingJobs = new Map<string, TrainingJob>([
			[
				"job-5",
				{
					id: "job-5",
					status: "running",
					progress: 42,
					queueDepth: 1,
					retryAfterMs: 1200,
					message: "Trainingslauf läuft",
				},
			],
		]);

		registerTrainingJobsRoutes(app, {
			authMiddleware: (_req, _res, next) => next(),
			trainingLimiter: (_req, _res, next) => next(),
			healthLimiter: (_req, _res, next) => next(),
			landmarkTupleSchema: z.tuple([z.number(), z.number(), z.number()]),
			frameSchema: z.object({
				timestampMs: z.number(),
				landmarks: z.array(z.tuple([z.number(), z.number(), z.number()])),
			}),
			handLandmarksPerHand: 21,
			totalHandLandmarks: 42,
			multimodalLandmarks: 543,
			startTrainingJob: () => ({
				jobId: "job-5",
				status: "running",
				queueDepth: 1,
				retryAfterMs: 1200,
			}),
			trainingJobs,
			isProfileAuthorized: () => true,
		});

		const response = await request(app).get("/api/v1/train-status/job-5").expect(200);

		expect(response.body).toEqual({
			id: "job-5",
			status: "running",
			progress: 42,
			queueDepth: 1,
			retryAfterMs: 1200,
			message: "Trainingslauf läuft",
		});
	});

	it("returns German validation error messages for empty payloads", async () => {
		const app = express();
		app.use(express.json());
		registerTrainingJobsRoutes(app, {
			authMiddleware: (_req, _res, next) => next(),
			trainingLimiter: (_req, _res, next) => next(),
			healthLimiter: (_req, _res, next) => next(),
			landmarkTupleSchema: z.tuple([z.number(), z.number(), z.number()]),
			frameSchema: z.object({
				timestampMs: z.number(),
				landmarks: z.array(z.tuple([z.number(), z.number(), z.number()])),
			}),
			handLandmarksPerHand: 21,
			totalHandLandmarks: 42,
			multimodalLandmarks: 543,
			startTrainingJob: () => ({
				jobId: "job-2",
				status: "running",
				queueDepth: 0,
				retryAfterMs: 0,
			}),
			trainingJobs: new Map(),
			isProfileAuthorized: () => true,
		});

		const response = await request(app).post("/api/v1/train-model").send({}).expect(400);
		expect(response.body.error).toBe("Samples-Liste darf nicht leer sein.");

		const noIdResponse = await request(app).get("/api/v1/train-status").expect(400);
		expect(noIdResponse.body.error).toBe("Training-Job-ID ist erforderlich.");
	});
});
