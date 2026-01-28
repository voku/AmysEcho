import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { atomicWriteJson } from "../utils/atomicFs.js";

export type ProfileMetadata = {
	ageYears?: number;
	birthDate?: string;
	primaryLanguage?: string;
	notes?: string;
};

export type ProfileDevice = {
	deviceId: string;
	name?: string;
	lastSyncAt?: string;
	lastSeenAt?: string;
};

export type CaregiverAccess = {
	caregiverId: string;
	role: "owner" | "caregiver" | "viewer";
	addedAt: string;
};

export type ProfileRecord = {
	id: string;
	displayName: string;
	createdAt: string;
	updatedAt: string;
	metadata: ProfileMetadata;
	devices: ProfileDevice[];
	caregivers: CaregiverAccess[];
};

export type ProfileSyncToken = {
	token: string;
	profileId: string;
	createdAt: string;
	expiresAt: string;
	deviceId?: string;
	usedAt?: string;
};

export type ProfileShareToken = {
	token: string;
	profileId: string;
	createdAt: string;
	expiresAt: string;
	permissions: "read" | "write";
	createdBy?: string;
	acceptedBy?: string;
	acceptedAt?: string;
};

export type ProfileBackupRecord = {
	profileId: string;
	createdAt: string;
	path: string;
	sizeBytes: number;
	checksum: string;
};

export type ProfileRegistry = {
	version: number;
	updatedAt: string;
	profiles: ProfileRecord[];
	syncTokens: ProfileSyncToken[];
	shareTokens: ProfileShareToken[];
	backups: ProfileBackupRecord[];
};

export const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nowIso(): string {
	return new Date().toISOString();
}

function normalizeMetadata(input?: Partial<ProfileMetadata>): ProfileMetadata {
	return {
		ageYears: typeof input?.ageYears === "number" ? input.ageYears : undefined,
		birthDate:
			typeof input?.birthDate === "string" ? input.birthDate : undefined,
		primaryLanguage:
			typeof input?.primaryLanguage === "string"
				? input.primaryLanguage
				: undefined,
		notes: typeof input?.notes === "string" ? input.notes : undefined,
	};
}

function normalizeProfileRecord(record: ProfileRecord): ProfileRecord {
	if (!UUID_REGEX.test(record.id)) {
		throw new Error(`Ungültige Profil-ID im Registry-Eintrag: ${record.id}`);
	}
	return {
		...record,
		metadata: normalizeMetadata(record.metadata),
		devices: Array.isArray(record.devices)
			? record.devices.filter(Boolean)
			: [],
		caregivers: Array.isArray(record.caregivers)
			? record.caregivers.filter(Boolean)
			: [],
	};
}

export function createEmptyRegistry(): ProfileRegistry {
	return {
		version: 1,
		updatedAt: nowIso(),
		profiles: [],
		syncTokens: [],
		shareTokens: [],
		backups: [],
	};
}

export async function loadProfileRegistry(
	filePath: string,
): Promise<ProfileRegistry> {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		const parsed = JSON.parse(raw) as ProfileRegistry;
		const registry = createEmptyRegistry();
		registry.version = typeof parsed.version === "number" ? parsed.version : 1;
		registry.updatedAt =
			typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso();
		registry.profiles = Array.isArray(parsed.profiles)
			? parsed.profiles.map(normalizeProfileRecord)
			: [];
		registry.syncTokens = Array.isArray(parsed.syncTokens)
			? parsed.syncTokens
			: [];
		registry.shareTokens = Array.isArray(parsed.shareTokens)
			? parsed.shareTokens
			: [];
		registry.backups = Array.isArray(parsed.backups) ? parsed.backups : [];
		return registry;
	} catch (error) {
		const code = (error as NodeJS.ErrnoException)?.code;
		if (code === "ENOENT") {
			return createEmptyRegistry();
		}
		throw error;
	}
}

export async function saveProfileRegistry(
	filePath: string,
	registry: ProfileRegistry,
): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await atomicWriteJson(filePath, registry);
}

export function findProfileRecord(
	registry: ProfileRegistry,
	id: string,
): ProfileRecord | undefined {
	return registry.profiles.find((profile) => profile.id === id);
}

export function ensureProfileRecord(
	registry: ProfileRegistry,
	{
		id,
		displayName,
		metadata,
	}: {
		id?: string;
		displayName?: string;
		metadata?: Partial<ProfileMetadata>;
	},
): ProfileRecord {
	if (id) {
		const existing = findProfileRecord(registry, id);
		if (existing) {
			return existing;
		}
	}

	const createdAt = nowIso();
	const record: ProfileRecord = {
		id: id && UUID_REGEX.test(id) ? id : randomUUID(),
		displayName: displayName?.trim() || "Profil",
		createdAt,
		updatedAt: createdAt,
		metadata: normalizeMetadata(metadata),
		devices: [],
		caregivers: [],
	};
	registry.profiles.push(record);
	registry.updatedAt = nowIso();
	return record;
}

export function updateProfileRecord(
	registry: ProfileRegistry,
	id: string,
	updates: { displayName?: string; metadata?: Partial<ProfileMetadata> },
): ProfileRecord | undefined {
	const record = findProfileRecord(registry, id);
	if (!record) {
		return undefined;
	}
	if (typeof updates.displayName === "string") {
		record.displayName = updates.displayName.trim() || record.displayName;
	}
	if (updates.metadata) {
		record.metadata = {
			...record.metadata,
			...normalizeMetadata(updates.metadata),
		};
	}
	record.updatedAt = nowIso();
	registry.updatedAt = nowIso();
	return record;
}

export function registerDevice(
	registry: ProfileRegistry,
	profileId: string,
	device: { deviceId: string; name?: string },
): ProfileRecord | undefined {
	const record = findProfileRecord(registry, profileId);
	if (!record) return undefined;
	const existing = record.devices.find((d) => d.deviceId === device.deviceId);
	const now = nowIso();
	if (existing) {
		existing.lastSeenAt = now;
		if (device.name) existing.name = device.name;
	} else {
		record.devices.push({
			deviceId: device.deviceId,
			name: device.name,
			lastSeenAt: now,
		});
	}
	record.updatedAt = now;
	registry.updatedAt = now;
	return record;
}

export function createSyncToken(
	registry: ProfileRegistry,
	profileId: string,
	{ deviceId, ttlHours = 24 }: { deviceId?: string; ttlHours?: number },
): ProfileSyncToken {
	const createdAt = nowIso();
	const expiresAt = new Date(
		Date.now() + ttlHours * 60 * 60 * 1000,
	).toISOString();
	const token = randomUUID();
	const record: ProfileSyncToken = {
		token,
		profileId,
		createdAt,
		expiresAt,
		deviceId,
	};
	registry.syncTokens.push(record);
	registry.updatedAt = nowIso();
	return record;
}

export function redeemSyncToken(
	registry: ProfileRegistry,
	token: string,
	deviceId?: string,
): ProfileSyncToken | undefined {
	const record = registry.syncTokens.find((t) => t.token === token);
	if (!record) return undefined;
	if (record.usedAt) return undefined;
	if (new Date(record.expiresAt).getTime() < Date.now()) return undefined;
	record.usedAt = nowIso();
	if (deviceId) {
		record.deviceId = deviceId;
	}
	registry.updatedAt = nowIso();
	return record;
}

export function createShareToken(
	registry: ProfileRegistry,
	profileId: string,
	{
		permissions,
		ttlHours = 168,
		createdBy,
	}: { permissions: "read" | "write"; ttlHours?: number; createdBy?: string },
): ProfileShareToken {
	const createdAt = nowIso();
	const expiresAt = new Date(
		Date.now() + ttlHours * 60 * 60 * 1000,
	).toISOString();
	const token = randomUUID();
	const record: ProfileShareToken = {
		token,
		profileId,
		createdAt,
		expiresAt,
		permissions,
		createdBy,
	};
	registry.shareTokens.push(record);
	registry.updatedAt = nowIso();
	return record;
}

export function redeemShareToken(
	registry: ProfileRegistry,
	token: string,
	caregiverId: string,
): ProfileShareToken | undefined {
	const record = registry.shareTokens.find((t) => t.token === token);
	if (!record) return undefined;
	if (record.acceptedAt) return undefined;
	if (new Date(record.expiresAt).getTime() < Date.now()) return undefined;
	record.acceptedAt = nowIso();
	record.acceptedBy = caregiverId;
	registry.updatedAt = nowIso();
	return record;
}

export function attachCaregiver(
	registry: ProfileRegistry,
	profileId: string,
	caregiver: { caregiverId: string; role: "owner" | "caregiver" | "viewer" },
): ProfileRecord | undefined {
	const record = findProfileRecord(registry, profileId);
	if (!record) return undefined;
	const existing = record.caregivers.find(
		(c) => c.caregiverId === caregiver.caregiverId,
	);
	const now = nowIso();
	if (existing) {
		existing.role = caregiver.role;
	} else {
		record.caregivers.push({
			caregiverId: caregiver.caregiverId,
			role: caregiver.role,
			addedAt: now,
		});
	}
	record.updatedAt = now;
	registry.updatedAt = now;
	return record;
}
