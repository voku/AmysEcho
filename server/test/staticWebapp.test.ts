import express from "express";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import request from "supertest";
import {
	registerStaticWebapp,
	resolveWebappDir,
} from "../src/bootstrap/staticWebapp.js";

describe("registerStaticWebapp", () => {
	const originalEnv = { ...process.env };
	let tempDir: string;
	let fixtureDir: string;

	beforeEach(async () => {
		process.env = { ...originalEnv };
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "amy-static-webapp-"));
		fixtureDir = path.join(tempDir, "dist");
		await fs.mkdir(path.join(fixtureDir, "assets"), { recursive: true });
		await fs.writeFile(
			path.join(fixtureDir, "index.html"),
			"<!doctype html><html><body>amy-webapp</body></html>",
			"utf8",
		);
		await fs.writeFile(
			path.join(fixtureDir, "assets", "app.123abc.js"),
			"console.log('amy');",
			"utf8",
		);
		await fs.writeFile(path.join(fixtureDir, ".env"), "SECRET=1", "utf8");
		process.env.AMY_ECHO_WEBAPP_DIR = fixtureDir;
	});

	afterEach(async () => {
		process.env = { ...originalEnv };
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("serves static assets from AMY_ECHO_WEBAPP_DIR with cache headers", async () => {
		const app = express();
		expect(resolveWebappDir()).toBe(path.resolve(fixtureDir));
		expect(registerStaticWebapp(app)).toBe(true);

		const response = await request(app).get("/assets/app.123abc.js").expect(200);

		expect(response.text).toContain("console.log('amy');");
		expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
	});

	it("serves index.html for root and frontend routes without aggressively caching it", async () => {
		const app = express();
		registerStaticWebapp(app);

		const rootResponse = await request(app).get("/").expect(200);
		const nestedResponse = await request(app).get("/training/history").expect(200);

		expect(rootResponse.text).toContain("amy-webapp");
		expect(nestedResponse.text).toContain("amy-webapp");
		expect(rootResponse.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
		expect(nestedResponse.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
	});

	it("does not let SPA fallback swallow API 404s or backend health routes", async () => {
		const app = express();
		app.get("/health", (_req, res) => {
			res.json({ status: "ok" });
		});
		registerStaticWebapp(app);

		const healthResponse = await request(app).get("/health").expect(200);
		const apiResponse = await request(app).get("/api/v1/non-existing-route").expect(404);

		expect(healthResponse.body).toEqual({ status: "ok" });
		expect(apiResponse.text).not.toContain("amy-webapp");
	});

	it("does not expose dotfiles or reserved private paths", async () => {
		const app = express();
		registerStaticWebapp(app);

		await request(app).get("/.env").expect(404);
		const privatePathResponse = await request(app).get("/data/private-runtime.json").expect(404);

		expect(privatePathResponse.text).not.toContain("amy-webapp");
	});
});
