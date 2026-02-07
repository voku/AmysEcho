import express, { type Express } from "express";
import request from "supertest";
import { AuthService } from "../src/services/authService.js";

describe("metacom sentence improvement routes", () => {
	let app: Express;
	let accessToken: string;
	const originalFetch = global.fetch;

	beforeAll(async () => {
		process.env.OPENAI_API_KEY = "test-openai-key";
		jest.resetModules();
		const mod = await import("../src/routes/metacomSentenceRoutes.js");
		app = express();
		app.use(express.json());
		mod.registerMetacomSentenceRoutes(app);
		accessToken = AuthService.generateTokens({
			id: "tester",
			username: "tester",
			role: "caregiver",
		}).accessToken;
	});

	afterAll(() => {
		delete process.env.OPENAI_API_KEY;
	});

	beforeEach(() => {
		global.fetch = jest.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					choices: [{ message: { content: "Ich esse Brot." } }],
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			),
		) as jest.Mock;
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it("rejects unauthenticated requests", async () => {
		const response = await request(app)
			.post("/api/v1/metacom/sentence-improve")
			.send({ sentence: "Ich Brot" })
			.expect(401);

		expect(response.body.error).toBe("Bitte zuerst anmelden.");
	});

	it("validates payloads", async () => {
		const response = await request(app)
			.post("/api/v1/metacom/sentence-improve")
			.set("Authorization", `Bearer ${accessToken}`)
			.send({ sentence: "" })
			.expect(400);

		expect(response.body.error).toBe("Ungültige Satzdaten.");
	});

	it("returns an improved sentence", async () => {
		const response = await request(app)
			.post("/api/v1/metacom/sentence-improve")
			.set("Authorization", `Bearer ${accessToken}`)
			.send({ sentence: "Ich Brot", locale: "de" })
			.expect(200);

		expect(response.body).toEqual({ improvedSentence: "Ich esse Brot." });
	});
});
