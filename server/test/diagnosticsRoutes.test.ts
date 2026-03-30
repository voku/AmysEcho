import express from "express";
import request from "supertest";
import { registerDiagnosticsRoutes } from "../src/routes/diagnosticsRoutes.js";

describe("registerDiagnosticsRoutes", () => {
	it("serves health payload on both health endpoints", async () => {
		const app = express();
		registerDiagnosticsRoutes(app, {
			healthLimiter: (_req, _res, next) => next(),
			getPendingTrainingJobs: () => 3,
		});

		const rootResponse = await request(app).get("/health").expect(200);
		expect(rootResponse.body.pendingTrainingJobs).toBe(3);
		expect(rootResponse.body).toHaveProperty("checks.database");
		expect(rootResponse.body).toHaveProperty("checks.globalModel");
		expect(rootResponse.body).toHaveProperty("checks.pythonDependencies");
		expect(rootResponse.body).toHaveProperty("checks.trainingManifest");

		const apiResponse = await request(app).get("/api/v1/health").expect(200);
		expect(Object.keys(apiResponse.body.checks).sort()).toEqual(
			Object.keys(rootResponse.body.checks).sort(),
		);
	});
});
