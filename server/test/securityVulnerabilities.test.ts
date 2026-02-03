/**
 * Security vulnerability tests
 * Tests for security issues identified in blind spot analysis
 */

import request from "supertest";
import express, { type Application } from "express";
import { registerProfileRoutes } from "../src/routes/profileRoutes";
import { setupDatabase, type Database, saveDatabase } from "../src/db";
import { createEmptyRegistry, saveProfileRegistry } from "../src/services/profileRegistry";
import { type ProfileRegistry } from "../src/types";
import { AuthService } from "../src/services/authService";
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("Security Vulnerability Tests", () => {
	let app: Application;
	let db: Database;
	let registry: ProfileRegistry;
	let tmpDir: string;
	let dbFilePath: string;
	let registryPath: string;

	beforeEach(async () => {
		// Create temporary directory for test data
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "security-test-"));
		dbFilePath = path.join(tmpDir, "db.json");
		registryPath = path.join(tmpDir, "profile_registry.json");

		// Initialize database
		const dbSetup = await setupDatabase(dbFilePath);
		db = dbSetup.db;

		// Initialize registry
		registry = createEmptyRegistry();
		await saveProfileRegistry(registryPath, registry);

		// Setup Express app
		app = express();
		app.use(express.json());

		// Mock auth middleware
		app.use((req, _res, next) => {
			const authHeader = req.headers.authorization;
			if (authHeader?.startsWith("Bearer ")) {
				const token = authHeader.substring(7);
				try {
					const decoded = AuthService.verifyAccessToken(token);
					req.user = { id: decoded.id, username: decoded.username };
				} catch (err) {
					// Invalid token
				}
			}
			next();
		});

		// Setup profile routes
		registerProfileRoutes(app, {
			authMiddleware: (req, _res, next) => {
				if (!req.user) {
					return _res.status(401).json({ error: "Unauthorized" });
				}
				next();
			},
			db,
			dbFilePath,
			registry,
			registryPath,
			withFileLock: async (_path, fn) => fn(),
			saveRegistry: saveProfileRegistry,
			logError: () => {},
		});
	});

	afterEach(async () => {
		// Cleanup temporary directory
		try {
			await fs.rm(tmpDir, { recursive: true, force: true });
		} catch (err) {
			// Ignore cleanup errors
		}
	});

	describe("Profile Takeover Vulnerability (HIGH SEVERITY)", () => {
		it("should prevent user from taking over another user's profile", async () => {
			const user1Token = AuthService.generateTokens({
				id: "user-1",
				username: "user1",
				role: "caregiver",
			}).accessToken;
			const user2Token = AuthService.generateTokens({
				id: "user-2",
				username: "user2",
				role: "caregiver",
			}).accessToken;
			const profileId = "12345678-1234-1234-8234-123456789abc";

			// User 1 creates a profile
			const createResponse = await request(app)
				.post("/api/v1/profiles")
				.set("Authorization", `Bearer ${user1Token}`)
				.send({
					id: profileId,
					displayName: "User 1's Profile",
				});

			expect(createResponse.status).toBe(201);
			expect(createResponse.body.profile.id).toBe(profileId);

			// Verify profile is in database with user1's ID
			const dbProfile = db.profiles.find((p) => p.id === profileId);
			expect(dbProfile).toBeDefined();
			expect(dbProfile?.userId).toBe("user-1");

			// User 2 attempts to take over the profile by creating it again
			const takeoverResponse = await request(app)
				.post("/api/v1/profiles")
				.set("Authorization", `Bearer ${user2Token}`)
				.send({
					id: profileId,
					displayName: "User 2's Takeover Attempt",
				});

			// Should be rejected with 403
			expect(takeoverResponse.status).toBe(403);
			expect(takeoverResponse.body.error).toContain("gehört einem anderen Benutzer");

			// Verify profile still belongs to user 1
			const dbProfileAfter = db.profiles.find((p) => p.id === profileId);
			expect(dbProfileAfter?.userId).toBe("user-1");
		});

		it("should allow idempotent profile creation by the same user", async () => {
			const userToken = AuthService.generateTokens({
				id: "user-1",
				username: "user1",
				role: "caregiver",
			}).accessToken;
			const profileId = "87654321-4321-1234-8234-abcdef123456";

			// User creates a profile
			const createResponse1 = await request(app)
				.post("/api/v1/profiles")
				.set("Authorization", `Bearer ${userToken}`)
				.send({
					id: profileId,
					displayName: "My Profile",
				});

			expect(createResponse1.status).toBe(201);

			// User creates the same profile again (idempotent)
			const createResponse2 = await request(app)
				.post("/api/v1/profiles")
				.set("Authorization", `Bearer ${userToken}`)
				.send({
					id: profileId,
					displayName: "My Profile Again",
				});

			// Should succeed (idempotent) - either 201 or 409 is acceptable
			expect([201, 409]).toContain(createResponse2.status);

			// Verify profile still belongs to the same user
			const dbProfile = db.profiles.find((p) => p.id === profileId);
			expect(dbProfile?.userId).toBe("user-1");
		});
	});

	describe("Profile Listing Authorization", () => {
		it("should only return profiles the user has access to", async () => {
			const user1Token = AuthService.generateTokens({
				id: "user-1",
				username: "user1",
				role: "caregiver",
			}).accessToken;
			const user2Token = AuthService.generateTokens({
				id: "user-2",
				username: "user2",
				role: "caregiver",
			}).accessToken;

			// User 1 creates a profile
			const create1Response = await request(app)
				.post("/api/v1/profiles")
				.set("Authorization", `Bearer ${user1Token}`)
				.send({
					id: "11111111-1111-1111-8111-111111111111",
					displayName: "User 1 Profile",
				});
			expect(create1Response.status).toBe(201);

			// User 2 creates a profile
			const create2Response = await request(app)
				.post("/api/v1/profiles")
				.set("Authorization", `Bearer ${user2Token}`)
				.send({
					id: "22222222-2222-2222-8222-222222222222",
					displayName: "User 2 Profile",
				});
			expect(create2Response.status).toBe(201);

			// Verify both profiles are in the database with correct userIds
			expect(db.profiles).toHaveLength(2);
			const user1Profile = db.profiles.find((p) => p.id === "11111111-1111-1111-8111-111111111111");
			const user2Profile = db.profiles.find((p) => p.id === "22222222-2222-2222-8222-222222222222");
			expect(user1Profile?.userId).toBe("user-1");
			expect(user2Profile?.userId).toBe("user-2");

			// User 1 lists profiles
			const user1Response = await request(app)
				.get("/api/v1/profiles")
				.set("Authorization", `Bearer ${user1Token}`);

			expect(user1Response.status).toBe(200);
			// Should only see their own profile
			expect(user1Response.body.profiles).toHaveLength(1);
			expect(user1Response.body.profiles[0].id).toBe("11111111-1111-1111-8111-111111111111");

			// User 2 lists profiles
			const user2Response = await request(app)
				.get("/api/v1/profiles")
				.set("Authorization", `Bearer ${user2Token}`);

			expect(user2Response.status).toBe(200);
			// Should only see their own profile
			expect(user2Response.body.profiles).toHaveLength(1);
			expect(user2Response.body.profiles[0].id).toBe("22222222-2222-2222-8222-222222222222");
		});
	});
});
