import { sha256 } from 'js-sha256';

/**
 * Profile Registry Service
 * 
 * Provides secure multi-child profile management with:
 * - UUID-based stable identities
 * - HMAC-SHA-256 integrity verification
 * - Tamper detection and recovery
 * 
 * For Amy: Supports multiple children in one household while keeping
 * each child's training data, models, and progress completely separate
 * and protected from accidental or malicious tampering.
 */

const REGISTRY_STORAGE_KEY = 'webapp:profile-registry';
const REGISTRY_VERSION = 1;

// Secret key for HMAC (in production, this would be per-device or server-provided)
// For now, we use a stable key that makes tampering detectable
const SECRET_SEED = 'amys-echo-profile-integrity-v1';

export interface ProfileMetadata {
  childAge?: number;
  primaryLanguage?: string;
  avatar?: string;  // Emoji or color identifier
  notes?: string;
}

export interface Profile {
  uuid: string;              // UUID v4 - truly stable ID
  profileId: string;         // Backend storage key
  displayName: string;       // User-friendly name
  createdAt: string;         // ISO timestamp
  metadata: ProfileMetadata;
  securityToken: string;     // HMAC-SHA-256 for integrity
}

export interface ProfileRegistry {
  profiles: Profile[];
  activeProfileUuid: string | null;
  registryVersion: number;
  checksum: string;          // SHA-256 of profiles array
}

/**
 * Generate a UUID v4
 */
function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback using crypto.getRandomValues for older browsers without randomUUID
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // Set version 4 bits
    if (bytes[6] !== undefined) {
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
    }
    // Set variant bits
    if (bytes[8] !== undefined) {
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
    }
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Last resort fallback - should rarely if ever be reached in modern browsers
  console.error('Crypto functions are not available. UUIDs will not be truly random.');
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Securely generate a hash using Web Crypto API or a fallback.
 * @param data The data to hash.
 * @returns A hex-encoded hash string.
 */
async function secureHash(data: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', data as BufferSource);
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (e) {
      console.warn('Web Crypto API failed, falling back to js-sha256.', e);
      // Fallback to js-sha256 if Web Crypto fails for any reason
      return sha256(data);
    }
  }
  console.warn('Web Crypto API not available, falling back to js-sha256. Tamper detection will be less secure.');
  return sha256(data);
}


/**
 * Generate HMAC-SHA256 security token for a profile
 * This makes manual localStorage tampering detectable
 */
async function generateSecurityToken(uuid: string, profileId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${uuid}:${profileId}:${SECRET_SEED}`);
  
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      // Use Web Crypto API
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(SECRET_SEED),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', key, data);
      return Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (e) {
      console.warn('Web Crypto API failed for HMAC, falling back to SHA-256 hash.', e);
      return secureHash(data);
    }
  }
  
  console.warn('Web Crypto API not available for HMAC, falling back to SHA-256 hash.');
  return secureHash(data);
}

/**
 * Verify a profile's security token
 */
async function verifySecurityToken(profile: Profile): Promise<boolean> {
  const expectedToken = await generateSecurityToken(profile.uuid, profile.profileId);
  return expectedToken === profile.securityToken;
}

/**
 * Generate checksum for the entire registry
 */
async function generateChecksum(profiles: Profile[]): Promise<string> {
  // Include more fields in the checksum for better integrity
  const data = JSON.stringify(profiles.map((p) => ({
    uuid: p.uuid,
    profileId: p.profileId,
    displayName: p.displayName,
    createdAt: p.createdAt,
    securityToken: p.securityToken,
  })));
  
  return secureHash(new TextEncoder().encode(data));
}

/**
 * Load profile registry from localStorage with integrity checking
 */
export async function loadProfileRegistry(): Promise<ProfileRegistry | null> {
  try {
    const raw = localStorage.getItem(REGISTRY_STORAGE_KEY);
    if (!raw) return null;
    
    const registry = JSON.parse(raw) as ProfileRegistry;
    
    // Basic structure validation
    if (!registry || !Array.isArray(registry.profiles) || typeof registry.checksum !== 'string') {
        console.error('[Profile Registry] Invalid registry structure in localStorage.');
        return null;
    }
    
    // Verify registry version
    if (registry.registryVersion !== REGISTRY_VERSION) {
      console.warn(`[Profile Registry] Version mismatch (found ${registry.registryVersion}, expected ${REGISTRY_VERSION}), registry may be outdated or incompatible.`);
    }
    
    // Verify checksum
    const expectedChecksum = await generateChecksum(registry.profiles);
    if (expectedChecksum !== registry.checksum) {
      console.error('[Profile Registry] Checksum mismatch - registry has been tampered with or is corrupt!');
      // Optionally, trigger a recovery flow or clear the corrupted data
      // localStorage.removeItem(REGISTRY_STORAGE_KEY);
      return null;
    }
    
    // Verify each profile's security token
    for (const profile of registry.profiles) {
      if (!profile || typeof profile.uuid !== 'string') {
        console.error('[Profile Registry] Found invalid profile entry while loading.');
        continue; // Skip invalid entries
      }
      const isValid = await verifySecurityToken(profile);
      if (!isValid) {
        console.error(`[Profile Registry] Security token invalid for profile ${profile.uuid}. The profile may be corrupt or tampered with.`);
        // Decide on a strategy: either return null to invalidate the whole registry,
        // or filter out invalid profiles. For now, we invalidate the whole registry.
        return null;
      }
    }
    
    // Ensure active profile is valid
    if (registry.activeProfileUuid && !registry.profiles.some(p => p.uuid === registry.activeProfileUuid)) {
        console.warn(`[Profile Registry] Active profile UUID "${registry.activeProfileUuid}" not found in profiles list. Resetting active profile.`);
        registry.activeProfileUuid = registry.profiles.length > 0 ? registry.profiles[0]?.uuid ?? null : null;
        // No need to save here, as this is a read operation. The next write will fix it.
    }


    return registry;
  } catch (error) {
    console.error('[Profile Registry] Failed to load or parse registry:', error);
    // Clear potentially corrupted data
    // localStorage.removeItem(REGISTRY_STORAGE_KEY);
    return null;
  }
}

/**
 * Save profile registry to localStorage with integrity protection
 */
export async function saveProfileRegistry(registry: ProfileRegistry): Promise<void> {
  try {
    // Generate fresh checksum before saving
    registry.checksum = await generateChecksum(registry.profiles);
    registry.registryVersion = REGISTRY_VERSION;
    
    localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(registry));
  } catch (error) {
    console.error('[Profile Registry] Failed to save registry:', error);
    throw new Error('Failed to save profile registry');
  }
}

/**
 * Create a new profile object. Does not add to the registry.
 */
export async function createProfile(params: {
  displayName: string;
  profileId?: string;
  metadata?: ProfileMetadata;
}): Promise<Profile> {
  const uuid = generateUuid();
  const profileId = params.profileId || params.displayName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `profile-${uuid.slice(0, 8)}`;
  
  const securityToken = await generateSecurityToken(uuid, profileId);
  
  const profile: Profile = {
    uuid,
    profileId,
    displayName: params.displayName,
    createdAt: new Date().toISOString(),
    metadata: params.metadata || {},
    securityToken,
  };
  
  return profile;
}

/**
 * Add a profile to the registry
 */
export async function addProfile(profile: Profile): Promise<void> {
  let registry = await loadProfileRegistry();
  
  if (!registry) {
    // Create new registry if one doesn't exist
    registry = {
      profiles: [],
      activeProfileUuid: null,
      registryVersion: REGISTRY_VERSION,
      checksum: '', // Will be calculated on save
    };
  }
  
  // Check for duplicate UUID or profileId
  if (registry.profiles.some((p) => p.uuid === profile.uuid)) {
    throw new Error('Profile with this UUID already exists');
  }
  
  if (registry.profiles.some((p) => p.profileId === profile.profileId)) {
    throw new Error('Profile with this profileId already exists');
  }
  
  registry.profiles.push(profile);
  
  // Set as active if it's the first profile
  if (registry.profiles.length === 1) {
    registry.activeProfileUuid = profile.uuid;
  }
  
  await saveProfileRegistry(registry);
}

/**
 * Get the active profile
 */
export async function getActiveProfile(): Promise<Profile | null> {
  const registry = await loadProfileRegistry();
  if (!registry || !registry.activeProfileUuid) return null;
  
  const profile = registry.profiles.find((p) => p.uuid === registry.activeProfileUuid);
  // The load function already handles invalid active UUID, but as a fallback:
  if (!profile) {
      if (registry.profiles.length > 0) {
          const firstProfile = registry.profiles[0];
          if(firstProfile) {
            console.warn('Active profile not found, falling back to the first available profile.');
            await setActiveProfile(firstProfile.uuid);
            return firstProfile;
          }
      }
      return null;
  }
  return profile;
}

/**
 * Set the active profile
 */
export async function setActiveProfile(uuid: string): Promise<void> {
  const registry = await loadProfileRegistry();
  if (!registry) {
    throw new Error('Profile not found');
  }
  
  const profile = registry.profiles.find((p) => p.uuid === uuid);
  if (!profile) {
    throw new Error('Profile not found');
  }
  
  if (registry.activeProfileUuid !== uuid) {
    registry.activeProfileUuid = uuid;
    await saveProfileRegistry(registry);
  }
}

/**
 * List all profiles
 */
export async function listProfiles(): Promise<Profile[]> {
  const registry = await loadProfileRegistry();
  return registry?.profiles || [];
}

/**
 * Update a profile
 */
export async function updateProfile(uuid: string, updates: Partial<Omit<Profile, 'uuid' | 'profileId' | 'securityToken'>>): Promise<void> {
  const registry = await loadProfileRegistry();
  if (!registry) {
    throw new Error('Profile not found');
  }
  
  const index = registry.profiles.findIndex((p) => p.uuid === uuid);
  if (index === -1) {
    throw new Error('Profile not found');
  }
  
  // Apply updates to the found profile
  const originalProfile = registry.profiles[index];
  if (originalProfile) {
    registry.profiles[index] = {
      ...originalProfile,
      ...updates,
      // Ensure metadata is merged, not replaced, if it exists in updates
      metadata: {
        ...originalProfile.metadata,
        ...(updates.metadata || {}),
      },
    };
  }

  await saveProfileRegistry(registry);
}

/**
 * Delete a profile
 */
export async function deleteProfile(uuid: string): Promise<void> {
  const registry = await loadProfileRegistry();
  if (!registry) {
    console.warn('Cannot delete profile: No profile registry found.');
    return;
  }
  
  const initialProfileCount = registry.profiles.length;
  registry.profiles = registry.profiles.filter((p) => p.uuid !== uuid);
  
  if (registry.profiles.length === initialProfileCount) {
    console.warn(`Profile with UUID ${uuid} not found for deletion.`);
    return; // Nothing to do
  }
  
  // If we deleted the active profile, switch to another one
  if (registry.activeProfileUuid === uuid) {
    registry.activeProfileUuid = registry.profiles.length > 0 ? (registry.profiles[0]?.uuid ?? null) : null;
  }
  
  await saveProfileRegistry(registry);
}

/**
 * Initialize profile registry (call on app startup)
 */
export async function initializeProfileRegistry(): Promise<void> {
  console.log('[Profile Registry] Initializing and verifying integrity...');
  const registry = await loadProfileRegistry();
  if (!registry) {
    console.log('[Profile Registry] No valid registry found. A new one will be created on first profile addition.');
  } else {
    console.log(`[Profile Registry] Initialization complete. Loaded ${registry.profiles.length} profiles.`);
  }
}
