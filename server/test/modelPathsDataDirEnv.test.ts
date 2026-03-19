import path from "path";

describe("modelPaths data directory environment", () => {
	const originalEnv = { ...process.env };

	afterEach(() => {
		process.env = { ...originalEnv };
		jest.resetModules();
	});

	it("uses the canonical AMY_ECHO_DATA_DIR when present", async () => {
		process.env.AMY_ECHO_DATA_DIR = "/tmp/amy-canonical-data";
		delete process.env.AMY_DATA_DIR;

		const { DATA_DIR } = await import("../src/constants/modelPaths.js");

		expect(DATA_DIR).toBe(path.resolve("/tmp/amy-canonical-data"));
	});

	it("ignores the removed AMY_DATA_DIR alias", async () => {
		delete process.env.AMY_ECHO_DATA_DIR;
		process.env.AMY_DATA_DIR = "/tmp/amy-legacy-data";

		const { DATA_DIR, SERVER_DIR } = await import("../src/constants/modelPaths.js");

		expect(DATA_DIR).toBe(path.join(SERVER_DIR, "data"));
		expect(DATA_DIR).not.toBe(path.resolve("/tmp/amy-legacy-data"));
	});
});
