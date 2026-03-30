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
});
