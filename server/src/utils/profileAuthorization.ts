import type { Request } from "express";
import type { Database } from "../db.js";
import type { ProfileRegistry } from "../services/profileRegistry.js";

/**
 * Checks if the authenticated user is authorized to access a profile.
 * 
 * Authorization is granted if:
 * 1. The user owns the profile (profile.userId === user.id)
 * 2. The user is a caregiver with access to the profile (in ProfileRegistry)
 * 
 * SECURITY: This function must be called for ALL profile operations to prevent
 * unauthorized access. The old implementation only checked the x-profile-id header,
 * which was client-controlled and could be spoofed.
 */
export function isProfileAuthorized(
	req: Request,
	profileId: string,
	db: Database,
	registry: ProfileRegistry,
): boolean {
	// Validate inputs
	if (!profileId || typeof profileId !== "string" || profileId.trim() === "") {
		return false;
	}
	
	// Must be authenticated
	if (!req.user?.id) {
		return false;
	}
	
	// Find the profile in database
	const profile = db.profiles.find(p => p.id === profileId);
	if (!profile) {
		return false;
	}
	
	// Check if user owns the profile
	if (profile.userId === req.user.id) {
		return true;
	}
	
	// Check if user is a caregiver with access
	const registryRecord = registry.profiles.find(p => p.id === profileId);
	if (registryRecord) {
		const hasAccess = registryRecord.caregivers.some(
			c => c.caregiverId === req.user!.id
		);
		if (hasAccess) {
			return true;
		}
	}
	
	return false;
}

/**
 * Legacy function for backward compatibility.
 * @deprecated Use isProfileAuthorized with db and registry parameters instead.
 */
export function isProfileAuthorizedLegacy(req: Request, profileId: string): boolean {
	const claimed = req.header("x-profile-id");

	if (!profileId || typeof profileId !== "string" || profileId.trim() === "") {
		return false;
	}

	if (typeof claimed !== "string" || claimed.trim().length === 0) {
		return false;
	}
	const normalized = claimed.trim();
	return normalized === profileId.trim();
}
