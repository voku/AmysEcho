import path from "path";
import {
	getMlpModelPath,
	MLP_MODELS_DIR,
	TRAINED_MLP_MODEL_PATH,
} from "./modelPaths.js";

describe("getMlpModelPath", () => {
	it("returns global path when no profileId provided", () => {
		expect(getMlpModelPath()).toBe(TRAINED_MLP_MODEL_PATH);
	});
	it("returns profile-specific path when profileId provided", () => {
		expect(getMlpModelPath("11111111-1111-4111-8111-111111111111")).toBe(
			path.join(
				MLP_MODELS_DIR,
				"11111111-1111-4111-8111-111111111111",
				"amy_model.npz",
			),
		);
	});
	it("throws for invalid profileId", () => {
		expect(() => getMlpModelPath("../etc/passwd")).toThrow("Invalid");
	});
});
