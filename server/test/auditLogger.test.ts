/**
 * Tests for audit logging service
 */

import auditLogger from "../src/services/auditLogger";
import config from "../src/config/index";

describe("AuditLogger", () => {
	let consoleSpy: jest.SpyInstance;

	beforeEach(() => {
		consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		consoleSpy.mockRestore();
	});

	describe("log", () => {
		it("should log authentication events", async () => {
			await auditLogger.logAuth("AUTH_LOGIN_SUCCESS", {
				userId: "test-user-123",
				username: "testuser",
				ip: "127.0.0.1",
				success: true,
			});

			expect(consoleSpy).toHaveBeenCalled();
			const logCall = consoleSpy.mock.calls[0][0];
			
			// In production mode, log is JSON
			if (config.nodeEnv === "production") {
				const parsed = JSON.parse(logCall);
				expect(parsed.eventType).toBe("AUTH_LOGIN_SUCCESS");
				expect(parsed.userId).toBe("test-user-123");
				expect(parsed.success).toBe(true);
			} else {
				// In development mode, log is human-readable
				expect(logCall).toContain("AUTH_LOGIN_SUCCESS");
			}
		});

		it("should log login failures", async () => {
			await auditLogger.logAuth("AUTH_LOGIN_FAILURE", {
				username: "attacker",
				ip: "192.168.1.1",
				success: false,
				details: { reason: "invalid_password" },
			});

			expect(consoleSpy).toHaveBeenCalled();
		});

		it("should log profile access events", async () => {
			await auditLogger.logProfileAccess("PROFILE_ACCESS", {
				userId: "user-123",
				targetResourceId: "profile-456",
				ip: "127.0.0.1",
				success: true,
			});

			expect(consoleSpy).toHaveBeenCalled();
		});

		it("should log profile deletion events", async () => {
			await auditLogger.logProfileAccess("PROFILE_DELETE", {
				userId: "user-123",
				targetResourceId: "profile-456",
				ip: "127.0.0.1",
				success: true,
				details: { reason: "gdpr_request" },
			});

			expect(consoleSpy).toHaveBeenCalled();
		});
	});

	describe("logSecurityEvent", () => {
		it("should log rate limit exceeded events", async () => {
			await auditLogger.logSecurityEvent("RATE_LIMIT_EXCEEDED", {
				userId: "user-123",
				ip: "192.168.1.1",
				method: "POST",
				path: "/api/v1/auth/login",
				details: { windowMs: 60000, max: 5 },
			});

			expect(consoleSpy).toHaveBeenCalled();
		});

		it("should log authorization failures", async () => {
			await auditLogger.logSecurityEvent("AUTHORIZATION_FAILURE", {
				userId: "user-123",
				ip: "192.168.1.1",
				method: "GET",
				path: "/api/v1/profiles/other-user-profile",
			});

			expect(consoleSpy).toHaveBeenCalled();
		});

		it("should log HTTPS enforcement blocks", async () => {
			await auditLogger.logSecurityEvent("HTTPS_ENFORCEMENT_BLOCK", {
				ip: "192.168.1.1",
				method: "GET",
				path: "/api/v1/health",
			});

			expect(consoleSpy).toHaveBeenCalled();
		});
	});

	describe("logDataEvent", () => {
		it("should log data export events", async () => {
			await auditLogger.logDataEvent("DATA_EXPORT", {
				userId: "user-123",
				targetResourceId: "profile-456",
				targetResourceType: "profile",
				ip: "127.0.0.1",
				success: true,
			});

			expect(consoleSpy).toHaveBeenCalled();
		});

		it("should log training data uploads", async () => {
			await auditLogger.logDataEvent("TRAINING_DATA_UPLOAD", {
				userId: "user-123",
				targetResourceId: "bundle-789",
				ip: "127.0.0.1",
				success: true,
				details: { bundleSize: 1024000 },
			});

			expect(consoleSpy).toHaveBeenCalled();
		});
	});

	describe("timestamp format", () => {
		it("should include ISO timestamp", async () => {
			await auditLogger.log("AUTH_LOGIN_SUCCESS", {
				userId: "test-user",
				success: true,
			});

			expect(consoleSpy).toHaveBeenCalled();
			const logCall = consoleSpy.mock.calls[0][0];
			
			// Verify timestamp is present (ISO format check)
			expect(logCall).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		});
	});
});
