/**
 * Tests for HTTPS enforcement and HSTS security middleware
 */

import request from "supertest";
import express, { type Application } from "express";
import { httpsEnforcement, hstsHeaders } from "../src/middleware/httpsEnforcement";
import config from "../src/config/index";

describe("Security Middleware", () => {
	describe("HTTPS Enforcement", () => {
		let app: Application;

		beforeEach(() => {
			app = express();
			app.use(httpsEnforcement);
			app.get("/test", (_req, res) => res.json({ success: true }));
		});

		describe("in development mode", () => {
			const originalNodeEnv = config.nodeEnv;

			beforeAll(() => {
				// Force development mode
				(config as any).nodeEnv = "development";
			});

			afterAll(() => {
				(config as any).nodeEnv = originalNodeEnv;
			});

			it("should allow non-HTTPS requests", async () => {
				const response = await request(app).get("/test");
				expect(response.status).toBe(200);
				expect(response.body.success).toBe(true);
			});
		});

		describe("in production mode", () => {
			const originalNodeEnv = config.nodeEnv;

			beforeAll(() => {
				(config as any).nodeEnv = "production";
			});

			afterAll(() => {
				(config as any).nodeEnv = originalNodeEnv;
			});

			it("should reject non-HTTPS requests", async () => {
				const response = await request(app).get("/test");
				// In test environment without secure connection, should be rejected
				expect(response.status).toBe(403);
				expect(response.body.code).toBe("HTTPS_REQUIRED");
			});

			it("should allow requests with X-Forwarded-Proto: https", async () => {
				const response = await request(app)
					.get("/test")
					.set("X-Forwarded-Proto", "https");
				expect(response.status).toBe(200);
				expect(response.body.success).toBe(true);
			});

			it("should allow requests with X-Forwarded-Ssl: on", async () => {
				const response = await request(app)
					.get("/test")
					.set("X-Forwarded-Ssl", "on");
				expect(response.status).toBe(200);
				expect(response.body.success).toBe(true);
			});
		});
	});

	describe("HSTS Headers", () => {
		let app: Application;

		beforeEach(() => {
			app = express();
			app.use(hstsHeaders);
			app.get("/test", (_req, res) => res.json({ success: true }));
		});

		describe("in development mode", () => {
			const originalNodeEnv = config.nodeEnv;

			beforeAll(() => {
				(config as any).nodeEnv = "development";
			});

			afterAll(() => {
				(config as any).nodeEnv = originalNodeEnv;
			});

			it("should not add HSTS headers", async () => {
				const response = await request(app).get("/test");
				expect(response.status).toBe(200);
				expect(response.headers["strict-transport-security"]).toBeUndefined();
			});
		});

		describe("in production mode", () => {
			const originalNodeEnv = config.nodeEnv;

			beforeAll(() => {
				(config as any).nodeEnv = "production";
			});

			afterAll(() => {
				(config as any).nodeEnv = originalNodeEnv;
			});

			it("should add HSTS header with correct values", async () => {
				const response = await request(app)
					.get("/test")
					.set("X-Forwarded-Proto", "https");
				expect(response.status).toBe(200);
				const hsts = response.headers["strict-transport-security"];
				expect(hsts).toContain("max-age=31536000");
				expect(hsts).toContain("includeSubDomains");
				expect(hsts).toContain("preload");
			});
		});
	});
});
