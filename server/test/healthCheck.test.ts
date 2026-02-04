/**
 * Health check endpoint tests
 * Tests for enhanced health check with database, model, and Python dependency checks
 */

import request from "supertest";
import { app } from "../src/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

describe("Health Check Endpoint", () => {
	describe("GET /health", () => {
		it("should return health status with all checks", async () => {
			const response = await request(app).get("/health");

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty("status");
			expect(response.body).toHaveProperty("uptime");
			expect(response.body).toHaveProperty("pendingTrainingJobs");
			expect(response.body).toHaveProperty("checks");
			expect(response.body).toHaveProperty("timestamp");

			// Verify checks structure
			expect(response.body.checks).toHaveProperty("database");
			expect(response.body.checks).toHaveProperty("globalModel");
			expect(response.body.checks).toHaveProperty("pythonDependencies");
			expect(response.body.checks).toHaveProperty("trainingManifest");

			// Each check should have status
			expect(response.body.checks.database).toHaveProperty("status");
			expect(response.body.checks.globalModel).toHaveProperty("status");
			expect(response.body.checks.pythonDependencies).toHaveProperty("status");
			expect(response.body.checks.trainingManifest).toHaveProperty("status");
		});

		it("should report 'ok' or 'warning' for database check", async () => {
			const response = await request(app).get("/health");

			expect(response.status).toBe(200);
			const dbStatus = response.body.checks.database.status;
			expect(["ok", "warning"]).toContain(dbStatus);
		});

		it("should check Python dependencies", async () => {
			const response = await request(app).get("/health");

			expect(response.status).toBe(200);
			const pythonStatus = response.body.checks.pythonDependencies.status;
			// In CI, Python dependencies should be installed
			expect(["ok", "error"]).toContain(pythonStatus);
		});

		it("should include timestamp in ISO format", async () => {
			const response = await request(app).get("/health");

			expect(response.status).toBe(200);
			const timestamp = response.body.timestamp;
			expect(timestamp).toBeTruthy();
			// Verify it's a valid ISO timestamp
			expect(new Date(timestamp).toISOString()).toBe(timestamp);
		});

		it("should report uptime as a positive number", async () => {
			const response = await request(app).get("/health");

			expect(response.status).toBe(200);
			expect(typeof response.body.uptime).toBe("number");
			expect(response.body.uptime).toBeGreaterThan(0);
		});

		it("should report pending training jobs as a number", async () => {
			const response = await request(app).get("/health");

			expect(response.status).toBe(200);
			expect(typeof response.body.pendingTrainingJobs).toBe("number");
			expect(response.body.pendingTrainingJobs).toBeGreaterThanOrEqual(0);
		});
	});

	describe("GET /api/v1/health", () => {
		it("should also be accessible at versioned endpoint", async () => {
			const response = await request(app).get("/api/v1/health");

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty("status");
			expect(response.body).toHaveProperty("checks");
		});

		it("should return the same structure as /health", async () => {
			const response1 = await request(app).get("/health");
			const response2 = await request(app).get("/api/v1/health");

			expect(response1.status).toBe(200);
			expect(response2.status).toBe(200);
			
			// Both should have the same structure
			expect(Object.keys(response1.body).sort()).toEqual(Object.keys(response2.body).sort());
			expect(Object.keys(response1.body.checks).sort()).toEqual(Object.keys(response2.body.checks).sort());
		});
	});
});
