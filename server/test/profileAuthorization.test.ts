/**
 * Security tests for profile authorization
 * Tests to prevent the critical authorization bypass vulnerability
 */

import type { Request } from "express";
import { describe, it, expect, beforeEach } from "@jest/globals";
import { isProfileAuthorized } from "../src/utils/profileAuthorization";
import type { Database } from "../src/db";
import type { ProfileRegistry } from "../src/services/profileRegistry";
import type { Profile } from "../src/types";

describe("Profile Authorization Security Tests", () => {
	let mockDb: Database;
	let mockRegistry: ProfileRegistry;
	let mockRequest: Partial<Request>;

	beforeEach(() => {
		// Create mock database with test profiles
		mockDb = {
			profiles: [
				{
					id: "profile-123",
					userId: "user-alice",
					displayName: "Alice's Profile",
					createdAt: "2024-01-01T00:00:00Z",
					consentDataUpload: false,
					consentHelpMeGetSmarter: false,
					vocabularySetId: "basic",
				},
				{
					id: "profile-456",
					userId: "user-bob",
					displayName: "Bob's Profile",
					createdAt: "2024-01-01T00:00:00Z",
					consentDataUpload: false,
					consentHelpMeGetSmarter: false,
					vocabularySetId: "basic",
				},
				{
					id: "profile-789",
					userId: "user-alice",
					displayName: "Alice's Second Profile",
					createdAt: "2024-01-01T00:00:00Z",
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

		// Create mock registry with caregiver access
		mockRegistry = {
			version: 1,
			updatedAt: "2024-01-01T00:00:00Z",
			profiles: [
				{
					id: "profile-123",
					displayName: "Alice's Profile",
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T00:00:00Z",
					metadata: {},
					devices: [],
					caregivers: [
						{
							caregiverId: "user-alice",
							role: "owner",
							addedAt: "2024-01-01T00:00:00Z",
						},
					],
				},
				{
					id: "profile-456",
					displayName: "Bob's Profile",
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T00:00:00Z",
					metadata: {},
					devices: [],
					caregivers: [
						{
							caregiverId: "user-bob",
							role: "owner",
							addedAt: "2024-01-01T00:00:00Z",
						},
						{
							caregiverId: "user-caregiver",
							role: "caregiver",
							addedAt: "2024-01-01T00:00:00Z",
						},
					],
				},
				{
					id: "profile-789",
					displayName: "Alice's Second Profile",
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T00:00:00Z",
					metadata: {},
					devices: [],
					caregivers: [
						{
							caregiverId: "user-alice",
							role: "owner",
							addedAt: "2024-01-01T00:00:00Z",
						},
					],
				},
			],
			syncTokens: [],
			shareTokens: [],
			backups: [],
		};

		mockRequest = {
			user: undefined,
			header: jest.fn(),
		};
	});

	describe("Owner access", () => {
		it("should allow owner to access their own profile", () => {
			mockRequest.user = { id: "user-alice", username: "alice", role: "caregiver" };
			
			const result = isProfileAuthorized(
				mockRequest as Request,
				"profile-123",
				mockDb,
				mockRegistry
			);
			
			expect(result).toBe(true);
		});

		it("should allow owner to access their second profile", () => {
			mockRequest.user = { id: "user-alice", username: "alice", role: "caregiver" };
			
			const result = isProfileAuthorized(
				mockRequest as Request,
				"profile-789",
				mockDb,
				mockRegistry
			);
			
			expect(result).toBe(true);
		});

		it("should deny owner access to another user's profile", () => {
			mockRequest.user = { id: "user-alice", username: "alice", role: "caregiver" };
			
			const result = isProfileAuthorized(
				mockRequest as Request,
				"profile-456",
				mockDb,
				mockRegistry
			);
			
			expect(result).toBe(false);
		});
	});

	describe("Caregiver access", () => {
		it("should allow caregiver to access profile they have access to", () => {
			mockRequest.user = { id: "user-caregiver", username: "caregiver", role: "caregiver" };
			
			const result = isProfileAuthorized(
				mockRequest as Request,
				"profile-456",
				mockDb,
				mockRegistry
			);
			
			expect(result).toBe(true);
		});

		it("should deny caregiver access to profile without permission", () => {
			mockRequest.user = { id: "user-caregiver", username: "caregiver", role: "caregiver" };
			
			const result = isProfileAuthorized(
				mockRequest as Request,
				"profile-123",
				mockDb,
				mockRegistry
			);
			
			expect(result).toBe(false);
		});
	});

	describe("Security: Authorization bypass attempts", () => {
		it("should NOT allow access by spoofing x-profile-id header", () => {
			// This was the critical vulnerability - user could set x-profile-id header
			// to access any profile. This should now be blocked.
			mockRequest.user = { id: "user-alice", username: "alice", role: "caregiver" };
			mockRequest.header = jest.fn().mockReturnValue("profile-456");
			
			const result = isProfileAuthorized(
				mockRequest as Request,
				"profile-456", // Bob's profile
				mockDb,
				mockRegistry
			);
			
			// Should be denied because Alice doesn't own profile-456
			expect(result).toBe(false);
		});

		it("should deny access without authentication", () => {
			mockRequest.user = undefined;
			
			const result = isProfileAuthorized(
				mockRequest as Request,
				"profile-123",
				mockDb,
				mockRegistry
			);
			
			expect(result).toBe(false);
		});

		it("should deny access to non-existent profile", () => {
			mockRequest.user = { id: "user-alice", username: "alice", role: "caregiver" };
			
			const result = isProfileAuthorized(
				mockRequest as Request,
				"profile-nonexistent",
				mockDb,
				mockRegistry
			);
			
			expect(result).toBe(false);
		});

		it("should deny access with empty profile ID", () => {
			mockRequest.user = { id: "user-alice", username: "alice", role: "caregiver" };
			
			const result = isProfileAuthorized(
				mockRequest as Request,
				"",
				mockDb,
				mockRegistry
			);
			
			expect(result).toBe(false);
		});

		it("should deny access with whitespace-only profile ID", () => {
			mockRequest.user = { id: "user-alice", username: "alice", role: "caregiver" };
			
			const result = isProfileAuthorized(
				mockRequest as Request,
				"   ",
				mockDb,
				mockRegistry
			);
			
			expect(result).toBe(false);
		});
	});

	describe("Edge cases", () => {
		it("should handle profile in DB but not in registry", () => {
			// Add a profile to DB that's not in registry
			const orphanProfile: Profile = {
				id: "profile-orphan",
				userId: "user-alice",
				displayName: "Orphan Profile",
				createdAt: "2024-01-01T00:00:00Z",
				consentDataUpload: false,
				consentHelpMeGetSmarter: false,
				vocabularySetId: "basic",
			};
			mockDb.profiles.push(orphanProfile);
			
			mockRequest.user = { id: "user-alice", username: "alice", role: "caregiver" };
			
			// Should still allow access based on userId match
			const result = isProfileAuthorized(
				mockRequest as Request,
				"profile-orphan",
				mockDb,
				mockRegistry
			);
			
			expect(result).toBe(true);
		});

		it("should handle profile in registry but not in DB", () => {
			mockRequest.user = { id: "user-alice", username: "alice", role: "caregiver" };
			
			// Profile only exists in registry, not in DB
			const result = isProfileAuthorized(
				mockRequest as Request,
				"profile-registry-only",
				mockDb,
				mockRegistry
			);
			
			// Should deny because profile doesn't exist in DB
			expect(result).toBe(false);
		});
	});
});
