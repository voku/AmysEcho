import express from "express";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import request from "supertest";
import { registerModelMetadataRoutes } from "../src/routes/modelMetadataRoutes.js";

describe("registerModelMetadataRoutes", () => {
	it("returns model version payload", async () => {
		const app = express();
		registerModelMetadataRoutes(app, {
			authMiddleware: (_req, _res, next) => next(),
			modelMetadataLimiter: (_req, _res, next) => next(),
			readServerPackageJson: async () => ({ version: "9.9.9" }),
			collectLabelCounts: async () => ({ profileCounts: new Map() }),
			getMlpModelPath: () => "/tmp/does-not-matter.npz",
			isProfileAuthorized: () => true,
			profileIdPattern: /^[a-z-]+$/,
		});

		const response = await request(app).get("/api/v1/models/version").expect(200);
		expect(response.body).toEqual({
			version: "9.9.9",
			modelPath: "/api/v1/models/latest",
		});
	});

	it("returns 403 for unauthorized profile metadata", async () => {
		const app = express();
		registerModelMetadataRoutes(app, {
			authMiddleware: (_req, _res, next) => next(),
			modelMetadataLimiter: (_req, _res, next) => next(),
			readServerPackageJson: async () => ({ version: "1.0.0" }),
			collectLabelCounts: async () => ({ profileCounts: new Map() }),
			getMlpModelPath: () => "/tmp/does-not-matter.npz",
			isProfileAuthorized: () => false,
			profileIdPattern: /^[a-z-]+$/,
		});

		await request(app)
			.get("/api/v1/models/metadata?profileId=secret-profile")
			.expect(403);
	});

	it("lists only authorized model profiles", async () => {
		const originalDataDir = process.env.AMY_ECHO_DATA_DIR;
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "amy-model-profiles-"));
		const modelRoot = path.join(tempDir, "models");
		const allowedProfile = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
		const deniedProfile = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
		await fs.mkdir(path.join(modelRoot, allowedProfile), { recursive: true });
		await fs.mkdir(path.join(modelRoot, deniedProfile), { recursive: true });
		await fs.writeFile(path.join(modelRoot, allowedProfile, "amy_model.npz"), "x");
		await fs.writeFile(path.join(modelRoot, deniedProfile, "amy_model.npz"), "y");
		process.env.AMY_ECHO_DATA_DIR = tempDir;
		jest.resetModules();
		const { registerModelMetadataRoutes: registerRoutes } = await import(
			"../src/routes/modelMetadataRoutes.js"
		);
		const { getMlpModelPath } = await import("../src/constants/modelPaths.js");

		const app = express();
		registerRoutes(app, {
			authMiddleware: (_req, _res, next) => next(),
			modelMetadataLimiter: (_req, _res, next) => next(),
			readServerPackageJson: async () => ({ version: "1.0.0" }),
			collectLabelCounts: async () => ({
				profileCounts: new Map([[allowedProfile, { essen: 2 }], [deniedProfile, { trinken: 1 }]]),
			}),
			getMlpModelPath,
			isProfileAuthorized: (_req, profileId) => profileId === allowedProfile,
			profileIdPattern: /^[a-f0-9-]+$/,
		});

		const response = await request(app).get("/api/v1/models/profiles").expect(200);
		expect(response.body).toHaveLength(1);
		expect(response.body[0]).toMatchObject({
			profileId: allowedProfile,
			modelAvailable: true,
			signCount: 2,
		});

		await fs.rm(tempDir, { recursive: true, force: true });
		if (originalDataDir) {
			process.env.AMY_ECHO_DATA_DIR = originalDataDir;
		} else {
			delete process.env.AMY_ECHO_DATA_DIR;
		}
	});
});
