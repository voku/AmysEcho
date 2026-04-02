/**
 * Profile Label Routes API Tests
 *
 * Integration tests for the profile label settings API endpoints.
 * Amy First: Each child can configure their own label training modes.
 */

import { randomUUID } from "crypto";
import express, { type Express } from "express";
import request from "supertest";
import path from "path";
import { promises as fs } from "fs";
import { registerProfileLabelRoutes } from "../src/routes/profileLabelRoutes";
import { closeDatabase, initializeDatabase } from "../src/sqliteDb";
import type { Database } from "../src/db";
import type { ProfileRegistry } from "../src/services/profileRegistry";

// Create mock dependencies
const TEST_DB_PATH = path.join(__dirname, "../data/test-user-label-routes.sqlite");

describe("Profile Label Routes API", () => {
	let app: Express;
	let unauthorizedApp: Express;
	let testProfileId: string;
	let mockDb: Database;
	let mockRegistry: ProfileRegistry;

	beforeAll(async () => {
		// Clean up test database
		try {
			await fs.unlink(TEST_DB_PATH);
		} catch {
			// File may not exist
		}
		await initializeDatabase(TEST_DB_PATH);

		testProfileId = randomUUID();

		// Create mock database
		mockDb = {
			profiles: [
				{
					id: testProfileId,
					userId: "test-owner",
					displayName: "Test Profile",
					createdAt: new Date().toISOString(),
					consentDataUpload: false,
					consentHelpMeGetSmarter: false,
					vocabularySetId: "basic",
				},
			],
			symbols: [],
			signDefinitions: [],
			signTrainingData: [],
			interactionLogs: [],
			vocabularySets: [],
			vocabularySetSymbols: [],
			usageStats: [],
			learningAnalytics: [],
			corrections: [],
			negativeSamples: [],
			users: [],
		};

		// Create mock registry
		mockRegistry = {
			version: 1,
			updatedAt: new Date().toISOString(),
			profiles: [
				{
					id: testProfileId,
					displayName: "Test Profile",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					metadata: {},
					devices: [],
					caregivers: [
						{
							caregiverId: "test-owner",
							role: "owner",
							addedAt: new Date().toISOString(),
						},
					],
				},
			],
			syncTokens: [],
			shareTokens: [],
			backups: [],
		};

		// Setup Express app
		app = express();
		app.use(express.json());

		// Mock auth middleware - injects user for authorization
		const mockAuth = (
			req: express.Request,
			_res: express.Response,
			next: express.NextFunction,
		) => {
			req.user = { id: "test-owner", username: "test", role: "caregiver" };
			next();
		};
		const mockQueueAutoPretrainJob = ({
			userId,
			labelId,
		}: {
			userId: string;
			labelId: string;
		}) => ({
			jobId: "auto-pretrain-1",
			userId,
			labelId,
			status: "queued",
		});

		registerProfileLabelRoutes(app, {
			authMiddleware: mockAuth,
			db: mockDb,
			registry: mockRegistry,
			logError: () => {},
			queueAutoPretrainJob: mockQueueAutoPretrainJob,
		});

		unauthorizedApp = express();
		unauthorizedApp.use(express.json());
		const unauthorizedAuth = (
			req: express.Request,
			_res: express.Response,
			next: express.NextFunction,
		) => {
			req.user = { id: "outsider-user", username: "outsider", role: "caregiver" };
			next();
		};
		registerProfileLabelRoutes(unauthorizedApp, {
			authMiddleware: unauthorizedAuth,
			db: mockDb,
			registry: mockRegistry,
			logError: () => {},
			queueAutoPretrainJob: mockQueueAutoPretrainJob,
		});
	});

	afterAll(() => {
		closeDatabase();
	});

	describe("POST /api/v1/profiles/:profileId/labels/initialize", () => {
		it("should initialize default label settings for a profile", async () => {
			const response = await request(app)
				.post(`/api/v1/profiles/${testProfileId}/labels/initialize`)
				.expect(200);

			expect(response.body.status).toBe("initialized");
			expect(response.body.labelCount).toBeGreaterThan(0);
			expect(response.body.labels).toBeInstanceOf(Array);
		});

		it("should reject invalid profile ID", async () => {
			const response = await request(app)
				.post("/api/v1/profiles/invalid-id/labels/initialize")
				.expect(400);

			expect(response.body.error).toBe("Ungültige Profil-ID.");
		});
	});

	describe("GET /api/v1/profiles/:profileId/labels", () => {
		it("should return all labels with settings and readiness", async () => {
			const response = await request(app)
				.get(`/api/v1/profiles/${testProfileId}/labels`)
				.expect(200);

			expect(response.body.labels).toBeInstanceOf(Array);
			expect(response.body.stats).toBeDefined();
			expect(response.body.stats.totalLabels).toBeGreaterThan(0);

			// Check label structure
			if (response.body.labels.length > 0) {
				const label = response.body.labels[0];
				expect(label).toHaveProperty("labelId");
				expect(label).toHaveProperty("mode");
				expect(label).toHaveProperty("enabled");
				expect(label).toHaveProperty("ready");
				expect(label).toHaveProperty("reasons");
			}
		});

		it("should reject invalid profile ID", async () => {
			const response = await request(app)
				.get("/api/v1/profiles/invalid-id/labels")
				.expect(400);

			expect(response.body.error).toBe("Ungültige Profil-ID.");
		});

		it("should reject valid auth with unauthorized profile access", async () => {
			const response = await request(unauthorizedApp)
				.get(`/api/v1/profiles/${testProfileId}/labels`)
				.expect(403);

			expect(response.body.error).toBe("Zugriff verweigert.");
		});
	});

	describe("GET /api/v1/profiles/:profileId/labels/:labelId", () => {
		it("should return specific label details", async () => {
			const response = await request(app)
				.get(`/api/v1/profiles/${testProfileId}/labels/blau`)
				.expect(200);

			expect(response.body.labelId).toBe("blau");
			expect(response.body).toHaveProperty("mode");
			expect(response.body).toHaveProperty("enabled");
			expect(response.body).toHaveProperty("ready");
			expect(response.body).toHaveProperty("reasons");
		});

		it("should return 404 for non-existent label", async () => {
			const response = await request(app)
				.get(`/api/v1/profiles/${testProfileId}/labels/nonexistent123`)
				.expect(404);

			expect(response.body.error).toBe("Label nicht gefunden.");
		});
	});

	describe("PATCH /api/v1/profiles/:profileId/labels/:labelId", () => {
		it("should update label mode", async () => {
			const response = await request(app)
				.patch(`/api/v1/profiles/${testProfileId}/labels/blau`)
				.send({ mode: "server_pretrain" })
				.expect(200);

			expect(response.body.mode).toBe("server_pretrain");
		});

		it("should update label enabled status", async () => {
			const response = await request(app)
				.patch(`/api/v1/profiles/${testProfileId}/labels/blau`)
				.send({ enabled: false })
				.expect(200);

			expect(response.body.enabled).toBe(false);
		});

		it("should update both mode and enabled", async () => {
			const response = await request(app)
				.patch(`/api/v1/profiles/${testProfileId}/labels/rot`)
				.send({ mode: "user_train", enabled: true })
				.expect(200);

			expect(response.body.mode).toBe("user_train");
			expect(response.body.enabled).toBe(true);
		});

		it("should allow new labels and queue auto-pretrain jobs", async () => {
			const response = await request(app)
				.patch(`/api/v1/profiles/${testProfileId}/labels/kindergarten`)
				.send({ mode: "server_pretrain", enabled: true })
				.expect(200);

			expect(response.body.labelId).toBe("kindergarten");
			expect(response.body.autoPretrainJob).toBeDefined();
			expect(response.body.autoPretrainJob.jobId).toBe("auto-pretrain-1");
		});

		it("should reject invalid mode", async () => {
			const response = await request(app)
				.patch(`/api/v1/profiles/${testProfileId}/labels/blau`)
				.send({ mode: "invalid_mode" })
				.expect(400);

			expect(response.body.error).toBe("Ungültige Daten.");
		});

		it("should require at least one field", async () => {
			const response = await request(app)
				.patch(`/api/v1/profiles/${testProfileId}/labels/blau`)
				.send({})
				.expect(400);

			expect(response.body.error).toBe(
				"Mindestens 'mode' oder 'enabled' muss angegeben werden."
			);
		});
	});
});
