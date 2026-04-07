/**
 * User Label Settings Tests
 *
 * Tests for per-user, per-label training configuration.
 * Amy First: Each child can have their own personalized label collection.
 */

import { randomUUID } from "crypto";
import path from "path";
import os from "os";
import { promises as fs } from "fs";
import {
	closeDatabase,
	getEnabledProfileLabelsByMode,
	getProfileLabelSetting,
	getProfileLabelSettingsByProfileId,
	initializeDatabase,
	insertProfileLabelSetting,
	updateProfileLabelLastTrained,
	upsertProfileLabelSetting,
} from "../src/sqliteDb";
import type { UserLabelSetting } from "../src/types";

describe("User Label Settings (SQLite)", () => {
	let testDbDir: string;

	beforeAll(async () => {
		testDbDir = await fs.mkdtemp(path.join(os.tmpdir(), "amy-label-settings-"));
		await initializeDatabase(path.join(testDbDir, "labels.sqlite"));
	});

	afterAll(async () => {
		closeDatabase();
		if (testDbDir) {
			await fs.rm(testDbDir, { recursive: true, force: true });
		}
	});

	const testUserId = randomUUID();
	const testSettingId = randomUUID();

	test("should insert a user label setting", () => {
		const setting: UserLabelSetting = {
			id: testSettingId,
			profileId: testUserId,
			labelId: "blau",
			mode: "server_pretrain",
			enabled: true,
			updatedAt: new Date().toISOString(),
		};

		expect(() => insertProfileLabelSetting(setting)).not.toThrow();
	});

	test("should retrieve user label settings by userId", () => {
		const settings = getProfileLabelSettingsByProfileId(testUserId);
		expect(settings).toHaveLength(1);
		expect(settings[0].labelId).toBe("blau");
		expect(settings[0].mode).toBe("server_pretrain");
		expect(settings[0].enabled).toBe(true);
	});

	test("should retrieve a specific user label setting", () => {
		const setting = getProfileLabelSetting(testUserId, "blau");
		expect(setting).toBeDefined();
		expect(setting?.mode).toBe("server_pretrain");
	});

	test("should return undefined for non-existent setting", () => {
		const setting = getProfileLabelSetting(testUserId, "nonexistent");
		expect(setting).toBeUndefined();
	});

	test("should upsert (update) an existing setting", () => {
		const updatedSetting: UserLabelSetting = {
			id: randomUUID(), // Different ID
			profileId: testUserId,
			labelId: "blau",
			mode: "user_train", // Changed mode
			enabled: false, // Changed enabled
			updatedAt: new Date().toISOString(),
		};

		expect(() => upsertProfileLabelSetting(updatedSetting)).not.toThrow();

		const setting = getProfileLabelSetting(testUserId, "blau");
		expect(setting?.mode).toBe("user_train");
		expect(setting?.enabled).toBe(false);
		// Should retain original ID due to ON CONFLICT behavior
	});

	test("should upsert (insert) a new setting", () => {
		const newSetting: UserLabelSetting = {
			id: randomUUID(),
			profileId: testUserId,
			labelId: "rot",
			mode: "server_pretrain",
			enabled: true,
			updatedAt: new Date().toISOString(),
		};

		expect(() => upsertProfileLabelSetting(newSetting)).not.toThrow();

		const settings = getProfileLabelSettingsByProfileId(testUserId);
		expect(settings).toHaveLength(2);
	});

	test("should update lastTrainedAt", () => {
		const trainedAt = new Date().toISOString();
		expect(() =>
			updateProfileLabelLastTrained(testUserId, "blau", trainedAt)
		).not.toThrow();

		const setting = getProfileLabelSetting(testUserId, "blau");
		expect(setting?.lastTrainedAt).toBe(trainedAt);
	});

	test("should get enabled labels by mode", () => {
		// blau is disabled with user_train mode
		// rot is enabled with server_pretrain mode
		const serverPretrainLabels = getEnabledProfileLabelsByMode(
			testUserId,
			"server_pretrain"
		);
		expect(serverPretrainLabels).toHaveLength(1);
		expect(serverPretrainLabels[0].labelId).toBe("rot");

		const userTrainLabels = getEnabledProfileLabelsByMode(testUserId, "user_train");
		expect(userTrainLabels).toHaveLength(0); // blau is disabled
	});

	test("should handle multiple users independently", () => {
		const anotherUserId = randomUUID();
		const setting: UserLabelSetting = {
			id: randomUUID(),
			profileId: anotherUserId,
			labelId: "blau",
			mode: "user_train",
			enabled: true,
			updatedAt: new Date().toISOString(),
		};

		insertProfileLabelSetting(setting);

		const userSettings = getProfileLabelSettingsByProfileId(anotherUserId);
		expect(userSettings).toHaveLength(1);

		const originalUserSettings = getProfileLabelSettingsByProfileId(testUserId);
		expect(originalUserSettings).toHaveLength(2);
	});
});
