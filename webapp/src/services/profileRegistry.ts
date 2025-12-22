/**
 * Profile Registry Service
 * 
 * Provides secure multi-child profile management with:
 * - UUID-based stable identities
 * - HMAC-SHA256 integrity verification
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
  securityToken: string;     // HMAC-SHA256 for integrity
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
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    // Set variant bits
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Last resort fallback - should rarely if ever be reached in modern browsers
  throw new Error('No secure random number generator available');
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
    } catch {
      // Fall back to simple hash if Web Crypto fails
      return simpleHash(data);
    }
  }
  
  // Fallback for environments without crypto.subtle
  return simpleHash(data);
}

/**
 * Simple hash function as fallback
 */
function simpleHash(data: Uint8Array): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data[i];
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
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
  const data = JSON.stringify(profiles.map((p) => ({
    uuid: p.uuid,
    profileId: p.profileId,
    securityToken: p.securityToken,
  })));
  
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      return simpleHash(new TextEncoder().encode(data));
    }
  }
  
  return simpleHash(new TextEncoder().encode(data));
}

/**
 * Load profile registry from localStorage with integrity checking
 */
export async function loadProfileRegistry(): Promise<ProfileRegistry | null> {
  try {
    const raw = localStorage.getItem(REGISTRY_STORAGE_KEY);
    if (!raw) return null;
    
    const registry = JSON.parse(raw) as ProfileRegistry;
    
    // Verify registry version
    if (registry.registryVersion !== REGISTRY_VERSION) {
      console.warn('[Profile Registry] Version mismatch, registry may be outdated');
    }
    
    // Verify checksum
    const expectedChecksum = await generateChecksum(registry.profiles);
    if (expectedChecksum !== registry.checksum) {
      console.error('[Profile Registry] Checksum mismatch - registry has been tampered with!');
      return null;
    }
    
    // Verify each profile's security token
    for (const profile of registry.profiles) {
      const isValid = await verifySecurityToken(profile);
      if (!isValid) {
        console.error(`[Profile Registry] Security token invalid for profile ${profile.uuid}`);
        return null;
      }
    }
    
    return registry;
  } catch (error) {
    console.error('[Profile Registry] Failed to load registry:', error);
    return null;
  }
}

/**
 * Save profile registry to localStorage with integrity protection
 */
export async function saveProfileRegistry(registry: ProfileRegistry): Promise<void> {
  try {
    // Generate fresh checksum
    registry.checksum = await generateChecksum(registry.profiles);
    registry.registryVersion = REGISTRY_VERSION;
    
    localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(registry));
  } catch (error) {
    console.error('[Profile Registry] Failed to save registry:', error);
    throw new Error('Failed to save profile registry');
  }
}

/**
 * Create a new profile
 */
export async function createProfile(params: {
  displayName: string;
  profileId?: string;
  metadata?: ProfileMetadata;
}): Promise<Profile> {
  const uuid = generateUuid();
  const profileId = params.profileId || params.displayName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  const securityToken = await generateSecurityToken(uuid, profileId);
  
  return {
    uuid,
    profileId,
    displayName: params.displayName,
    createdAt: new Date().toISOString(),
    metadata: params.metadata || {},
    securityToken,
  };
}

/**
 * Add a profile to the registry
 */
export async function addProfile(profile: Profile): Promise<void> {
  let registry = await loadProfileRegistry();
  
  if (!registry) {
    // Create new registry
    registry = {
      profiles: [],
      activeProfileUuid: null,
      registryVersion: REGISTRY_VERSION,
      checksum: '',
    };
  }
  
  // Check for duplicate UUID or profileId
  const duplicateUuid = registry.profiles.find((p) => p.uuid === profile.uuid);
  const duplicateProfileId = registry.profiles.find((p) => p.profileId === profile.profileId);
  
  if (duplicateUuid) {
    throw new Error('Profile with this UUID already exists');
  }
  
  if (duplicateProfileId) {
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
  
  return registry.profiles.find((p) => p.uuid === registry.activeProfileUuid) || null;
}

/**
 * Set the active profile
 */
export async function setActiveProfile(uuid: string): Promise<void> {
  const registry = await loadProfileRegistry();
  if (!registry) {
    throw new Error('No profile registry found');
  }
  
  const profile = registry.profiles.find((p) => p.uuid === uuid);
  if (!profile) {
    throw new Error('Profile not found');
  }
  
  registry.activeProfileUuid = uuid;
  await saveProfileRegistry(registry);
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
    throw new Error('No profile registry found');
  }
  
  const index = registry.profiles.findIndex((p) => p.uuid === uuid);
  if (index === -1) {
    throw new Error('Profile not found');
  }
  
  // Apply updates
  registry.profiles[index] = {
    ...registry.profiles[index],
    ...updates,
  };
  
  await saveProfileRegistry(registry);
}

/**
 * Delete a profile
 */
export async function deleteProfile(uuid: string): Promise<void> {
  const registry = await loadProfileRegistry();
  if (!registry) {
    throw new Error('No profile registry found');
  }
  
  const index = registry.profiles.findIndex((p) => p.uuid === uuid);
  if (index === -1) {
    throw new Error('Profile not found');
  }
  
  registry.profiles.splice(index, 1);
  
  // If we deleted the active profile, switch to another
  if (registry.activeProfileUuid === uuid) {
    registry.activeProfileUuid = registry.profiles.length > 0 ? registry.profiles[0].uuid : null;
  }
  
  await saveProfileRegistry(registry);
}

/**
 * Initialize profile registry (call on app startup)
 */
export async function initializeProfileRegistry(): Promise<void> {
  // Verify registry integrity
  const registry = await loadProfileRegistry();
  if (!registry) {
    console.log('[Profile Registry] No registry found, will be created on first profile creation');
  } else {
    console.log(`[Profile Registry] Loaded ${registry.profiles.length} profiles`);
  }
}
