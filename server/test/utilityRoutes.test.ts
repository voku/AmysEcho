import express from "express";
import request from "supertest";
import { createDatabase } from "../src/db.js";
import { registerUtilityRoutes } from "../src/routes/utilityRoutes.js";

const profileId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function buildApp(options?: { authorized?: boolean }) {
	const app = express();
	app.use(express.json());
	const db = createDatabase();

	registerUtilityRoutes(app, {
		authMiddleware: (_req, _res, next) => next(),
		apiLimiter: (_req, _res, next) => next(),
		dataDir: "/tmp/amysecho-utility-routes-test",
		dbFilePath: "/tmp/amysecho-utility-routes-test/db.json",
		getDatabase: () => db,
		genId: () => "generated-id",
		getManifestEntries: async () => [{ label: "essen", profileId }],
		handLandmarksPerHand: 21,
		totalHandLandmarks: 42,
		multimodalLandmarks: 543,
		profileIdPattern: /^[0-9a-f-]{36}$/,
		resolveProfileId: async (value) => ({
			profileId: value === profileId ? profileId : null,
		}),
		isProfileAuthorized: () => options?.authorized ?? true,
		withFileLock: async (_file, fn) => fn(),
	});

	return { app, db };
}

describe("registerUtilityRoutes", () => {
	it("returns default normalization configuration when no config file exists", async () => {
		const { app } = buildApp();

		const response = await request(app)
			.get("/api/v1/config/normalization")
			.expect(200);

		expect(response.body).toEqual({
			priority_factors: {
				hands: 4.0,
				pose: 0.2,
				face: 0.05,
			},
		});
	});

	it("rejects unauthorized profile-specific DGS sample uploads", async () => {
		const { app } = buildApp({ authorized: false });

		await request(app)
			.post("/api/v1/dgs/samples")
			.send({
				label: "essen",
				profileId,
				landmarks: Array.from({ length: 21 }, () => [0.1, 0.2, 0.3]),
			})
			.expect(403);
	});

	it("records corrections through the injected database dependency", async () => {
		const { app, db } = buildApp();

		await request(app)
			.post("/api/v1/corrections")
			.send({ sign: { left: "essen", right: "trinken" } })
			.expect(202);

		expect(db.corrections).toHaveLength(1);
		expect(db.corrections[0]).toMatchObject({
			predictedSign: "unknown",
			actualSign: "essen+trinken",
			confidence: 0,
			isSynced: false,
		});
		expect(db.signTrainingData[0]).toMatchObject({
			signId: "essen+trinken",
			source: "HIP_3",
			syncStatus: "pending",
		});
	});
});
