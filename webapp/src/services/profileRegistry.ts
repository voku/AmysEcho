import { sha256 } from 'js-sha256';
import { logger } from './logger';
import type { MetacomVocabularySet } from '../types/metacomVocabulary';

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

const SECRET_STORAGE_KEY = 'webapp:profile-registry-secret';
const PROFILE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Derive a key for encrypting the registry secret using Web Crypto.
 * 
 * Note: This does not provide perfect secrecy against an attacker with
 * full access to the JS runtime, but it avoids storing the raw secret
 * directly in localStorage and raises the bar for casual inspection.
 */
async function deriveRegistryEncryptionKey(): Promise<CryptoKey | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return null;
  }
  // Static pepper; not stored in localStorage.
  const pepper = 'webapp:profile-registry-pepper-v1';
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(pepper),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  const salt = enc.encode('profile-registry-salt-v1');
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a string using AES-GCM and return a base64 encoded ciphertext.
 */
async function encryptRegistrySecret(plain: string): Promise<string | null> {
  const key = await deriveRegistryEncryptionKey();
  if (!key || typeof crypto === 'undefined' || !crypto.getRandomValues) {
    return null;
  }
  const enc = new TextEncoder();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    enc.encode(plain)
  );
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  
  // Store as base64 string
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a base64 encoded ciphertext using AES-GCM.
 */
async function decryptRegistrySecret(stored: string): Promise<string | null> {
  const key = await deriveRegistryEncryptionKey();
  if (!key) {
    return null;
  }
  try {
    const binary = atob(stored);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const iv = bytes.slice(0, 12);
    const data = bytes.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    // Decryption failed - likely because it's not encrypted or used a different key
    return null;
  }
}

/**
 * Get or generate a device-specific secret for registry integrity.
 * This ensures the secret is not hardcoded in the JS bundle, making
 * tampering more difficult as the secret varies per device.
 */
async function getRegistrySecret(): Promise<string> {
  try {
    const stored = localStorage.getItem(SECRET_STORAGE_KEY);
    if (stored) {
      const decrypted = await decryptRegistrySecret(stored);
      if (decrypted) return decrypted;
      localStorage.removeItem(SECRET_STORAGE_KEY);
    }

    // Generate a fresh 256-bit random secret
    const bytes = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
      const secret = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      
      // Encrypt before storing to address CodeQL 'Clear text storage' finding
      const encrypted = await encryptRegistrySecret(secret);
      if (encrypted) {
        localStorage.setItem(SECRET_STORAGE_KEY, encrypted);
        return secret;
      }
      
      throw new Error('Registrierungsgeheimnis konnte nicht sicher gespeichert werden.');
    }
  } catch (error) {
    console.error('[Profile Registry] Failed to generate or retrieve registry secret:', error);
  }
  
  throw new Error('Registrierungsgeheimnis konnte nicht erstellt werden.');
}

export interface ProfileMetadata {
  childAge?: number;
  vocabularySet?: MetacomVocabularySet;
  avatar?: string;  // Emoji or color identifier
  notes?: string;
}

export interface Profile {
  uuid: string;              // UUID v4 - truly stable ID
  profileId: string;         // Backend storage key (UUID)
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
  // Crypto is required for secure UUID generation
  throw new Error('Cryptographic functions are not available. Cannot generate secure UUIDs.');
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
async function generateSecurityToken(uuid: string, profileId: string, secretOverride?: string): Promise<string> {
  const secret = secretOverride || await getRegistrySecret();
  const encoder = new TextEncoder();
  const data = encoder.encode(`${uuid}:${profileId}:${secret}`);
  
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      // Use Web Crypto API
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
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
  // 1. Try with the current device secret
  const expectedToken = await generateSecurityToken(profile.uuid, profile.profileId);
  if (expectedToken === profile.securityToken) return true;
  
  return false;
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
    
    const validProfiles: Profile[] = [];
    let shouldPersistSanitizedRegistry = false;

    // Verify each profile's structure and security token.
    // Invalid legacy entries are ignored so they can't break authenticated API calls.
    for (const profile of registry.profiles) {
      if (!profile || typeof profile.uuid !== 'string' || typeof profile.profileId !== 'string') {
        console.error('[Profile Registry] Found invalid profile entry while loading.');
        shouldPersistSanitizedRegistry = true;
        continue;
      }

      const normalizedProfileId = profile.profileId.trim().toLowerCase();
      if (!PROFILE_ID_PATTERN.test(normalizedProfileId)) {
        console.warn(
          `[Profile Registry] Ignoring profile ${profile.uuid} with invalid profileId: ${profile.profileId}`,
        );
        shouldPersistSanitizedRegistry = true;
        continue;
      }

      if (normalizedProfileId !== profile.profileId) {
        shouldPersistSanitizedRegistry = true;
      }

      const isValid = await verifySecurityToken({ ...profile, profileId: normalizedProfileId });
      if (!isValid) {
        console.error(`[Profile Registry] Security token invalid for profile ${profile.uuid}. The profile may be corrupt or tampered with.`);
        // Decide on a strategy: either return null to invalidate the whole registry,
        // or filter out invalid profiles. For now, we invalidate the whole registry.
        return null;
      }

      validProfiles.push({ ...profile, profileId: normalizedProfileId });
    }

    registry.profiles = validProfiles;
    
    // Ensure active profile is valid
    if (registry.activeProfileUuid && !registry.profiles.some(p => p.uuid === registry.activeProfileUuid)) {
        console.warn(`[Profile Registry] Active profile UUID "${registry.activeProfileUuid}" not found in profiles list. Resetting active profile.`);
        registry.activeProfileUuid = registry.profiles.length > 0 ? registry.profiles[0]?.uuid ?? null : null;
        shouldPersistSanitizedRegistry = true;
    }

    if (shouldPersistSanitizedRegistry) {
      await saveProfileRegistry(registry);
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
  const normalizedProfileId = params.profileId?.trim().toLowerCase();
  if (normalizedProfileId && !PROFILE_ID_PATTERN.test(normalizedProfileId)) {
    throw new Error('Profil-ID muss eine UUID sein.');
  }
  const profileId = normalizedProfileId ?? uuid.toLowerCase();
  
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
  if (!registry) return null;
  if (!registry.activeProfileUuid) {
    const fallbackProfile = registry.profiles[0];
    if (fallbackProfile) {
      await setActiveProfile(fallbackProfile.uuid);
      return fallbackProfile;
    }
    return null;
  }
  
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
  logger.info('[Profile Registry] Initializing and verifying integrity...');
  const registry = await loadProfileRegistry();
  if (!registry) {
    logger.info('[Profile Registry] No valid registry found. A new one will be created on first profile addition.');
  } else {
    logger.info(`[Profile Registry] Initialization complete. Loaded ${registry.profiles.length} profiles.`);
  }
}

/**
 * Ensure login always uses the backend profile as active profile.
 * This intentionally replaces legacy local entries to avoid stale
 * non-backend profile IDs causing API sync failures after auth.
 */
export async function replaceWithBackendProfile(params: {
  profileId: string;
  displayName: string;
}): Promise<Profile> {
  const normalizedProfileId = params.profileId.trim().toLowerCase();
  if (!PROFILE_ID_PATTERN.test(normalizedProfileId)) {
    throw new Error('Profil-ID muss eine UUID sein.');
  }

  const profile = await createProfile({
    displayName: params.displayName,
    profileId: normalizedProfileId,
  });

  const registry: ProfileRegistry = {
    profiles: [profile],
    activeProfileUuid: profile.uuid,
    registryVersion: REGISTRY_VERSION,
    checksum: '',
  };

  await saveProfileRegistry(registry);
  return profile;
}
