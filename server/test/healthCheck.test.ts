/**
 * Health check endpoint tests
 * Tests for enhanced health check with database, model, and Python dependency checks
 */

import request from "supertest";
import { app } from "../src/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const HEALTH_CHECK_TIMEOUT_MS = 30_000;

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
		}, HEALTH_CHECK_TIMEOUT_MS);

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

	describe("Degraded status handling", () => {
		it("should set overall status to 'degraded' when any check has error status", async () => {
			const response = await request(app).get("/health");

			expect(response.status).toBe(200);
			
			// If any check has error status, overall status should be degraded
			const checks = response.body.checks;
			const hasError = Object.values(checks).some(
				(check: any) => check.status === "error"
			);
			
			if (hasError) {
				expect(response.body.status).toBe("degraded");
			} else {
				// If no errors, status should be "ok"
				expect(["ok"]).toContain(response.body.status);
			}
		});

		it("should include all required check fields even when degraded", async () => {
			const response = await request(app).get("/health");

			expect(response.status).toBe(200);
			
			// Verify all checks are present
			expect(response.body.checks).toHaveProperty("database");
			expect(response.body.checks).toHaveProperty("globalModel");
			expect(response.body.checks).toHaveProperty("pythonDependencies");
			expect(response.body.checks).toHaveProperty("trainingManifest");
			
			// Each check should have a status
			for (const checkName of ["database", "globalModel", "pythonDependencies", "trainingManifest"]) {
				expect(response.body.checks[checkName]).toHaveProperty("status");
				expect(["ok", "warning", "error"]).toContain(response.body.checks[checkName].status);
			}
		});
	});

	describe("Python Dependency Cache TTL", () => {
		it("should return cached result on consecutive calls", async () => {
			// Make first call
			const response1 = await request(app).get("/health");
			expect(response1.status).toBe(200);
			const pythonStatus1 = response1.body.checks.pythonDependencies;

			// Make second call immediately - should use cache
			const response2 = await request(app).get("/health");
			expect(response2.status).toBe(200);
			const pythonStatus2 = response2.body.checks.pythonDependencies;

			// Both calls should return the same status (from cache)
			expect(pythonStatus2.status).toBe(pythonStatus1.status);
		});

		it("should return consistent health check structure across multiple calls", async () => {
			const responses = await Promise.all([
				request(app).get("/health"),
				request(app).get("/health"),
				request(app).get("/health"),
			]);

			for (const response of responses) {
				expect(response.status).toBe(200);
				expect(response.body).toHaveProperty("status");
				expect(response.body).toHaveProperty("checks");
				expect(response.body.checks).toHaveProperty("pythonDependencies");
			}
		});

		it("should complete health check faster on cached calls", async () => {
			// First call (may spawn Python process)
			await request(app).get("/health");

			// Second call (should use cache)
			const startTime = Date.now();
			const response = await request(app).get("/health");
			const duration = Date.now() - startTime;

			expect(response.status).toBe(200);
			// Cached call should be very fast (no process spawn)
			// We can't guarantee exact timing but should be under 500ms with cache
			expect(duration).toBeLessThan(500);
		});
	});
});
