import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createProfile,
  addProfile,
  listProfiles,
  getActiveProfile,
  setActiveProfile,
  updateProfile,
  deleteProfile,
  loadProfileRegistry,
  replaceWithBackendProfile,
  type Profile,
} from './profileRegistry';

// Keep this payload selection aligned with generateChecksum() in profileRegistry.ts.
async function computeRegistryChecksum(profiles: Profile[]): Promise<string> {
  const normalizeMetadata = (metadata: Profile['metadata']) => {
    const normalized: Profile['metadata'] = {};
    for (const key of Object.keys(metadata ?? {}).sort() as Array<keyof Profile['metadata']>) {
      const value = metadata[key];
      if (value !== undefined) {
        normalized[key] = value;
      }
    }
    return normalized;
  };

  const encoder = new TextEncoder();
  const data = JSON.stringify(profiles.map((p) => ({
    uuid: p.uuid,
    profileId: p.profileId,
    displayName: p.displayName,
    createdAt: p.createdAt,
    metadata: normalizeMetadata(p.metadata),
    securityToken: p.securityToken,
  })));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(data))))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('profileRegistry', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('createProfile', () => {
    it('should create a profile with UUID and security token', async () => {
      const profile = await createProfile({
        displayName: 'Amy Marie',
      });

      expect(profile.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(profile.displayName).toBe('Amy Marie');
      expect(profile.profileId).toBe(profile.uuid);
      expect(profile.securityToken).toBeTruthy();
      expect(profile.securityToken.length).toBeGreaterThan(0);
      expect(profile.createdAt).toBeTruthy();
    });

    it('should use provided profileId if given', async () => {
      const profileId = '11111111-1111-4111-8111-111111111111';
      const profile = await createProfile({
        displayName: 'Test Child',
        profileId,
      });

      expect(profile.profileId).toBe(profileId);
    });

    it('should reject non-UUID profileId values', async () => {
      await expect(
        createProfile({
          displayName: 'Max 🎨 (Kita)',
          profileId: 'max-kita',
        }),
      ).rejects.toThrow('Profil-ID muss eine UUID sein.');
    });

    it('should include metadata if provided', async () => {
      const profile = await createProfile({
        displayName: 'Emma',
        metadata: {
          childAge: 5,
          avatar: '🌸',
        },
      });

      expect(profile.metadata.childAge).toBe(5);
      expect(profile.metadata.avatar).toBe('🌸');
    });
  });

  describe('addProfile', () => {
    it('should add a profile to the registry', async () => {
      const profile = await createProfile({ displayName: 'Amy' });
      await addProfile(profile);

      const profiles = await listProfiles();
      expect(profiles).toHaveLength(1);
      const firstProfile = profiles[0];
      if (firstProfile) {
        expect(firstProfile.uuid).toBe(profile.uuid);
      }
    });

    it('should set first profile as active', async () => {
      const profile = await createProfile({ displayName: 'Amy' });
      await addProfile(profile);

      const activeProfile = await getActiveProfile();
      expect(activeProfile?.uuid).toBe(profile.uuid);
    });

    it('should reject duplicate UUID', async () => {
      const profile = await createProfile({ displayName: 'Amy' });
      await addProfile(profile);

      await expect(addProfile(profile)).rejects.toThrow('Profile with this UUID already exists');
    });

    it('should reject duplicate profileId', async () => {
      const profileId = '22222222-2222-4222-8222-222222222222';
      const profile1 = await createProfile({ displayName: 'Amy', profileId });
      const profile2 = await createProfile({ displayName: 'Amy 2', profileId });
      
      await addProfile(profile1);
      await expect(addProfile(profile2)).rejects.toThrow('Profile with this profileId already exists');
    });
  });

  describe('listProfiles', () => {
    it('should return empty array when no profiles exist', async () => {
      const profiles = await listProfiles();
      expect(profiles).toEqual([]);
    });

    it('should return all profiles', async () => {
      const amy = await createProfile({ displayName: 'Amy' });
      const max = await createProfile({ displayName: 'Max' });
      
      await addProfile(amy);
      await addProfile(max);

      const profiles = await listProfiles();
      expect(profiles).toHaveLength(2);
      expect(profiles.map(p => p.displayName)).toEqual(['Amy', 'Max']);
    });
  });

  describe('getActiveProfile and setActiveProfile', () => {
    it('should return null when no active profile', async () => {
      const activeProfile = await getActiveProfile();
      expect(activeProfile).toBeNull();
    });

    it('should get and set active profile', async () => {
      const amy = await createProfile({ displayName: 'Amy' });
      const max = await createProfile({ displayName: 'Max' });
      
      await addProfile(amy);
      await addProfile(max);

      // Amy is active by default (first profile)
      let activeProfile = await getActiveProfile();
      expect(activeProfile?.displayName).toBe('Amy');

      // Switch to Max
      await setActiveProfile(max.uuid);
      activeProfile = await getActiveProfile();
      expect(activeProfile?.displayName).toBe('Max');
    });

    it('should throw error when setting non-existent profile as active', async () => {
      await expect(setActiveProfile('non-existent-uuid')).rejects.toThrow('Profile not found');
    });
  });

  describe('updateProfile', () => {
    it('should update profile display name', async () => {
      const profile = await createProfile({ displayName: 'Amy' });
      await addProfile(profile);

      await updateProfile(profile.uuid, { displayName: 'Amy Marie' });

      const profiles = await listProfiles();
      expect(profiles).toHaveLength(1);
      const firstProfile = profiles[0];
      if (firstProfile) {
        expect(firstProfile.displayName).toBe('Amy Marie');
      }
    });

    it('should update profile metadata', async () => {
      const profile = await createProfile({
        displayName: 'Amy',
        metadata: { childAge: 5, avatar: '👶' }
      });
      await addProfile(profile);

      await updateProfile(profile.uuid, {
        metadata: { childAge: 6, avatar: '🌈' }
      });

      const profiles = await listProfiles();
      const firstProfile = profiles[0];
      if (firstProfile) {
        expect(firstProfile.metadata.childAge).toBe(6);
        expect(firstProfile.metadata.avatar).toBe('🌈');
      }
    });

    it('should rotate security token when metadata changes', async () => {
      const profile = await createProfile({
        displayName: 'Amy',
        metadata: { childAge: 5, vocabularySet: 'basis' },
      });
      await addProfile(profile);

      const beforeRegistryRaw = localStorage.getItem('webapp:profile-registry');
      if (!beforeRegistryRaw) {
        throw new Error('Expected profile registry to be present in localStorage');
      }
      const beforeRegistry = JSON.parse(beforeRegistryRaw);
      const beforeToken = beforeRegistry.profiles[0]?.securityToken;

      await updateProfile(profile.uuid, {
        metadata: { childAge: 6 },
      });

      const afterRegistryRaw = localStorage.getItem('webapp:profile-registry');
      if (!afterRegistryRaw) {
        throw new Error('Expected profile registry to be present in localStorage after update');
      }
      const afterRegistry = JSON.parse(afterRegistryRaw);
      const afterToken = afterRegistry.profiles[0]?.securityToken;

      expect(beforeToken).toBeTruthy();
      expect(afterToken).toBeTruthy();
      expect(afterToken).not.toBe(beforeToken);
    });

    it('should throw error when updating non-existent profile', async () => {
      await expect(updateProfile('non-existent-uuid', { displayName: 'Test' }))
        .rejects.toThrow('Profile not found');
    });
  });

  describe('deleteProfile', () => {
    it('should delete a profile', async () => {
      const profile = await createProfile({ displayName: 'Amy' });
      await addProfile(profile);

      await deleteProfile(profile.uuid);

      const profiles = await listProfiles();
      expect(profiles).toHaveLength(0);
    });

    it('should switch active profile when deleting active profile', async () => {
      const amy = await createProfile({ displayName: 'Amy' });
      const max = await createProfile({ displayName: 'Max' });
      
      await addProfile(amy);
      await addProfile(max);

      // Amy is active by default
      await deleteProfile(amy.uuid);

      // Max should now be active
      const activeProfile = await getActiveProfile();
      expect(activeProfile?.displayName).toBe('Max');
    });

    it('should set active to null when deleting last profile', async () => {
      const profile = await createProfile({ displayName: 'Amy' });
      await addProfile(profile);

      await deleteProfile(profile.uuid);

      const activeProfile = await getActiveProfile();
      expect(activeProfile).toBeNull();
    });
  });

  describe('integrity verification', () => {
    it('should detect tampered metadata when checksum is bypassed', async () => {
      const profile = await createProfile({
        displayName: 'Amy',
        metadata: { childAge: 5, vocabularySet: 'basis' },
      });
      await addProfile(profile);

      const registryRaw = localStorage.getItem('webapp:profile-registry');
      if (!registryRaw) {
        throw new Error('Expected profile registry to be present in localStorage');
      }

      const registry = JSON.parse(registryRaw);
      registry.profiles[0].metadata = { childAge: 9, vocabularySet: 'voll' };
      registry.checksum = await computeRegistryChecksum(registry.profiles as Profile[]);
      localStorage.setItem('webapp:profile-registry', JSON.stringify(registry));

      const loadedRegistry = await loadProfileRegistry();
      expect(loadedRegistry).toBeNull();
    });

    it('should ignore legacy profiles with non-UUID profileId values', async () => {
      const validProfile = await createProfile({ displayName: 'Amy' });
      await addProfile(validProfile);

      const registryRaw = localStorage.getItem('webapp:profile-registry');
      if (!registryRaw) {
        throw new Error('Expected profile registry to be present in localStorage');
      }

      const registry = JSON.parse(registryRaw);
      registry.profiles.push({
        ...validProfile,
        uuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        profileId: 'amy-legacy-profile',
      });

      registry.checksum = await computeRegistryChecksum(registry.profiles as Profile[]);
      localStorage.setItem('webapp:profile-registry', JSON.stringify(registry));

      const loadedRegistry = await loadProfileRegistry();
      expect(loadedRegistry).not.toBeNull();
      expect(loadedRegistry?.profiles).toHaveLength(1);
      expect(loadedRegistry?.profiles[0]?.profileId).toBe(validProfile.profileId);

      const sanitizedRegistryRaw = localStorage.getItem('webapp:profile-registry');
      if (!sanitizedRegistryRaw) {
        throw new Error('Expected sanitized profile registry to be saved in localStorage');
      }
      const sanitizedRegistry = JSON.parse(sanitizedRegistryRaw);
      expect(sanitizedRegistry.profiles).toHaveLength(1);
      expect(sanitizedRegistry.profiles[0]?.profileId).toBe(validProfile.profileId);
    });

    it('should detect tampered registry', async () => {
      const profile = await createProfile({ displayName: 'Amy' });
      await addProfile(profile);

      // Tamper with localStorage
      const registryRaw = localStorage.getItem('webapp:profile-registry');
      if (registryRaw) {
        const registry = JSON.parse(registryRaw);
        registry.profiles[0].displayName = 'Tampered Name';
        localStorage.setItem('webapp:profile-registry', JSON.stringify(registry));
      }

      // Should detect tampering
      const loadedRegistry = await loadProfileRegistry();
      expect(loadedRegistry).toBeNull();
    });

    it('should detect tampered security token', async () => {
      const profile = await createProfile({ displayName: 'Amy' });
      await addProfile(profile);

      // Tamper with security token
      const registryRaw = localStorage.getItem('webapp:profile-registry');
      if (registryRaw) {
        const registry = JSON.parse(registryRaw);
        registry.profiles[0].securityToken = 'fake-token-12345';
        // Update checksum to bypass checksum check (testing token check specifically)
        registry.checksum = await computeRegistryChecksum(registry.profiles as Profile[]);
        localStorage.setItem('webapp:profile-registry', JSON.stringify(registry));
      }

      // Should detect tampered token
      const loadedRegistry = await loadProfileRegistry();
      expect(loadedRegistry).toBeNull();
    });
  });

  describe('replaceWithBackendProfile', () => {
    it('should merge backend profile into existing registry and set it active', async () => {
      const localProfile = await createProfile({ displayName: 'Lokal' });
      await addProfile(localProfile);

      const backendProfile = await replaceWithBackendProfile({
        profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        displayName: 'Amy Backend',
      });

      const profiles = await listProfiles();
      expect(profiles).toHaveLength(2);
      expect(profiles.some((p) => p.uuid === localProfile.uuid)).toBe(true);
      expect(profiles.some((p) => p.profileId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(true);

      const activeProfile = await getActiveProfile();
      expect(activeProfile?.uuid).toBe(backendProfile.uuid);
      expect(activeProfile?.profileId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    });

    it('should reuse existing backend profile and only update display name', async () => {
      const existingBackend = await createProfile({
        displayName: 'Alt',
        profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      });
      await addProfile(existingBackend);

      const result = await replaceWithBackendProfile({
        profileId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
        displayName: 'Neu',
      });

      const profiles = await listProfiles();
      expect(profiles).toHaveLength(1);
      expect(result.uuid).toBe(existingBackend.uuid);
      expect(result.displayName).toBe('Neu');
      expect(result.profileId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    });
  });
});
