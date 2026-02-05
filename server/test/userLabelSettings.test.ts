/**
 * User Label Settings Tests
 *
 * Tests for per-user, per-label training configuration.
 * Amy First: Each child can have their own personalized label collection.
 */

import { randomUUID } from "crypto";
import path from "path";
import { promises as fs } from "fs";
import {
	closeDatabase,
	getEnabledUserLabelsByMode,
	getUserLabelSetting,
	getUserLabelSettingsByUserId,
	initializeDatabase,
	insertUserLabelSetting,
	updateUserLabelLastTrained,
	upsertUserLabelSetting,
} from "../src/sqliteDb";
import type { UserLabelSetting } from "../src/types";

const TEST_DB_PATH = path.join(__dirname, "../data/test-user-labels.sqlite");

describe("User Label Settings (SQLite)", () => {
	beforeAll(async () => {
		// Clean up and initialize test database
		try {
			await fs.unlink(TEST_DB_PATH);
		} catch {
			// File may not exist
		}
		await initializeDatabase(TEST_DB_PATH);
	});

	afterAll(() => {
		closeDatabase();
	});

	const testUserId = randomUUID();
	const testSettingId = randomUUID();

	test("should insert a user label setting", () => {
		const setting: UserLabelSetting = {
			id: testSettingId,
			userId: testUserId,
			labelId: "blau",
			mode: "server_pretrain",
			enabled: true,
			updatedAt: new Date().toISOString(),
		};

		expect(() => insertUserLabelSetting(setting)).not.toThrow();
	});

	test("should retrieve user label settings by userId", () => {
		const settings = getUserLabelSettingsByUserId(testUserId);
		expect(settings).toHaveLength(1);
		expect(settings[0].labelId).toBe("blau");
		expect(settings[0].mode).toBe("server_pretrain");
		expect(settings[0].enabled).toBe(true);
	});

	test("should retrieve a specific user label setting", () => {
		const setting = getUserLabelSetting(testUserId, "blau");
		expect(setting).toBeDefined();
		expect(setting?.mode).toBe("server_pretrain");
	});

	test("should return undefined for non-existent setting", () => {
		const setting = getUserLabelSetting(testUserId, "nonexistent");
		expect(setting).toBeUndefined();
	});

	test("should upsert (update) an existing setting", () => {
		const updatedSetting: UserLabelSetting = {
			id: randomUUID(), // Different ID
			userId: testUserId,
			labelId: "blau",
			mode: "user_train", // Changed mode
			enabled: false, // Changed enabled
			updatedAt: new Date().toISOString(),
		};

		expect(() => upsertUserLabelSetting(updatedSetting)).not.toThrow();

		const setting = getUserLabelSetting(testUserId, "blau");
		expect(setting?.mode).toBe("user_train");
		expect(setting?.enabled).toBe(false);
		// Should retain original ID due to ON CONFLICT behavior
	});

	test("should upsert (insert) a new setting", () => {
		const newSetting: UserLabelSetting = {
			id: randomUUID(),
			userId: testUserId,
			labelId: "rot",
			mode: "server_pretrain",
			enabled: true,
			updatedAt: new Date().toISOString(),
		};

		expect(() => upsertUserLabelSetting(newSetting)).not.toThrow();

		const settings = getUserLabelSettingsByUserId(testUserId);
		expect(settings).toHaveLength(2);
	});

	test("should update lastTrainedAt", () => {
		const trainedAt = new Date().toISOString();
		expect(() =>
			updateUserLabelLastTrained(testUserId, "blau", trainedAt)
		).not.toThrow();

		const setting = getUserLabelSetting(testUserId, "blau");
		expect(setting?.lastTrainedAt).toBe(trainedAt);
	});

	test("should get enabled labels by mode", () => {
		// blau is disabled with user_train mode
		// rot is enabled with server_pretrain mode
		const serverPretrainLabels = getEnabledUserLabelsByMode(
			testUserId,
			"server_pretrain"
		);
		expect(serverPretrainLabels).toHaveLength(1);
		expect(serverPretrainLabels[0].labelId).toBe("rot");

		const userTrainLabels = getEnabledUserLabelsByMode(testUserId, "user_train");
		expect(userTrainLabels).toHaveLength(0); // blau is disabled
	});

	test("should handle multiple users independently", () => {
		const anotherUserId = randomUUID();
		const setting: UserLabelSetting = {
			id: randomUUID(),
			userId: anotherUserId,
			labelId: "blau",
			mode: "user_train",
			enabled: true,
			updatedAt: new Date().toISOString(),
		};

		insertUserLabelSetting(setting);

		const userSettings = getUserLabelSettingsByUserId(anotherUserId);
		expect(userSettings).toHaveLength(1);

		const originalUserSettings = getUserLabelSettingsByUserId(testUserId);
		expect(originalUserSettings).toHaveLength(2);
	});
});
