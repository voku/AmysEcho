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
  type Profile,
} from './profileRegistry';

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
      expect(profile.profileId).toBe('amy-marie');
      expect(profile.securityToken).toBeTruthy();
      expect(profile.securityToken.length).toBeGreaterThan(0);
      expect(profile.createdAt).toBeTruthy();
    });

    it('should use provided profileId if given', async () => {
      const profile = await createProfile({
        displayName: 'Test Child',
        profileId: 'custom-id-123',
      });

      expect(profile.profileId).toBe('custom-id-123');
    });

    it('should sanitize display name for profileId', async () => {
      const profile = await createProfile({
        displayName: 'Max 🎨 (Kita)',
      });

      expect(profile.profileId).toBe('max-kita');
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
      const profile1 = await createProfile({ displayName: 'Amy', profileId: 'amy' });
      const profile2 = await createProfile({ displayName: 'Amy 2', profileId: 'amy' });
      
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
        const encoder = new TextEncoder();
        const data = JSON.stringify(registry.profiles.map((p: Profile) => ({
          uuid: p.uuid,
          profileId: p.profileId,
          securityToken: p.securityToken,
        })));
        registry.checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(data))))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        localStorage.setItem('webapp:profile-registry', JSON.stringify(registry));
      }

      // Should detect tampered token
      const loadedRegistry = await loadProfileRegistry();
      expect(loadedRegistry).toBeNull();
    });
  });
});
