import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { MetacomVocabularySet } from '../types/metacomVocabulary';
import {
  listProfiles,
  getActiveProfile,
  setActiveProfile,
  createProfile,
  addProfile,
  deleteProfile,
  initializeProfileRegistry,
  syncProfileToServer,
  syncAllProfilesToServer,
  type Profile,
} from '../services/profileRegistry';
import { useApiConfig } from '../hooks/useApiConfig';

/**
 * ProfileManager - Multi-child profile selector and manager
 * 
 * For Amy: Supports multiple children in one household. Each child
 * gets their own identity, training data, and personalized models.
 * Caregivers can easily switch between profiles or create new ones.
 */
export function ProfileManager() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfileState] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileAge, setNewProfileAge] = useState('');
  const [newProfileAvatar, setNewProfileAvatar] = useState('👤');
  const [newProfileVocabulary, setNewProfileVocabulary] = useState<MetacomVocabularySet>('basis');
  const navigate = useNavigate();
  const { apiToken } = useApiConfig();

  const avatarOptions = ['👤', '🌈', '🌸', '🎨', '⭐', '🦋', '🌻', '🐻', '🦊', '🐰'];
  const vocabularyOptions: Array<{ value: MetacomVocabularySet; label: string }> = [
    { value: 'einsteiger', label: 'Einsteiger (wenige Symbole)' },
    { value: 'basis', label: 'Basis (Alltag)' },
    { value: 'erweitert', label: 'Erweitert (mehr Wörter)' },
    { value: 'voll', label: 'Voll (maximaler Wortschatz)' },
  ];

  // Load profiles on mount
  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      await initializeProfileRegistry();
      const allProfiles = await listProfiles();
      const active = await getActiveProfile();
      
      setProfiles(allProfiles);
      setActiveProfileState(active);
    } catch (error) {
      console.error('[ProfileManager] Failed to load profiles:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load profiles on mount
  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // Sync all local profiles to the server when the token becomes available
  useEffect(() => {
    if (apiToken) {
      void syncAllProfilesToServer(apiToken);
    }
  }, [apiToken]);

  const handleSelectProfile = useCallback(async (profile: Profile) => {
    try {
      await setActiveProfile(profile.uuid);
      setActiveProfileState(profile);
      
      // Navigate to main app
      navigate('/');
    } catch (error) {
      console.error('[ProfileManager] Failed to set active profile:', error);
      alert('Profil konnte nicht aktiviert werden. Bitte versuche es erneut.');
    }
  }, [navigate]);

  const handleCreateProfile = useCallback(async () => {
    if (!newProfileName.trim()) {
      alert('Bitte gib einen Namen für das Profil ein.');
      return;
    }

    try {
      const age = newProfileAge ? parseInt(newProfileAge, 10) : undefined;
      const metadata: {
          childAge?: number;
          avatar: string;
          vocabularySet: MetacomVocabularySet;
      } = {
        avatar: newProfileAvatar,
        vocabularySet: newProfileVocabulary,
      };

      if (age !== undefined && !isNaN(age)) {
        metadata.childAge = age;
      }

      const profile = await createProfile({
        displayName: newProfileName.trim(),
        metadata,
      });

      await addProfile(profile);

      // Sync new profile to server so training uploads can find it
      if (apiToken) {
        void syncProfileToServer(profile, apiToken).catch((error) => {
          console.warn('[ProfileManager] Server-Sync fehlgeschlagen:', error);
        });
      }

      await loadProfiles();
      
      // Select the new profile
      await handleSelectProfile(profile);
      
      setShowCreateForm(false);
      setNewProfileName('');
      setNewProfileAge('');
      setNewProfileAvatar('👤');
      setNewProfileVocabulary('basis');
    } catch (error) {
      console.error('[ProfileManager] Failed to create profile:', error);
      alert('Profil konnte nicht erstellt werden. Bitte versuche es erneut.');
    }
  }, [
    newProfileName,
    newProfileAge,
    newProfileAvatar,
    newProfileVocabulary,
    loadProfiles,
    handleSelectProfile,
    apiToken,
  ]);

  const handleDeleteProfile = useCallback(async (profile: Profile) => {
    const confirmed = window.confirm(
      `Möchtest du das Profil "${profile.displayName}" wirklich löschen? ` +
      `Alle Trainingsdaten, Modelle und aufgezeichneten Gebärden für ${profile.displayName} werden dauerhaft gelöscht. ` +
      `Diese Aktion kann nicht rückgängig gemacht werden.`
    );

    if (!confirmed) return;

    // Double confirmation for safety
    const doubleConfirmed = window.confirm(
      `Letzte Bestätigung: Alle Daten von ${profile.displayName} werden unwiderruflich gelöscht. Fortfahren?`
    );

    if (!doubleConfirmed) return;

    try {
      await deleteProfile(profile.uuid);
      await loadProfiles();
      
      // If we deleted the active profile, the system automatically switches
      const newActive = await getActiveProfile();
      setActiveProfileState(newActive);
      
      if (!newActive) {
        // No profiles left, show create form
        setShowCreateForm(true);
      }
    } catch (error) {
      console.error('[ProfileManager] Failed to delete profile:', error);
      alert('Profil konnte nicht gelöscht werden. Bitte versuche es erneut.');
    }
  }, [loadProfiles]);

  if (loading) {
    return (
      <section className="card profile-manager">
        <div className="profile-manager-header">
          <h2>Lade Profile...</h2>
        </div>
      </section>
    );
  }

  if (profiles.length === 0 || showCreateForm) {
    return (
      <section className="card profile-manager">
        <div className="profile-manager-header">
          <h2>{profiles.length === 0 ? 'Willkommen!' : 'Neues Profil erstellen'}</h2>
          <p className="muted">
            {profiles.length === 0
              ? 'Erstelle ein Profil, um Amy\'s Echo zu nutzen.'
              : 'Füge ein weiteres Kinderprofil hinzu.'}
          </p>
        </div>

        <div className="profile-create-form">
          <div className="form-group">
            <label htmlFor="profile-name">Name des Kindes</label>
            <input
              id="profile-name"
              type="text"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              placeholder="z.B. Amy"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="profile-age">Alter (optional)</label>
            <input
              id="profile-age"
              type="number"
              value={newProfileAge}
              onChange={(e) => setNewProfileAge(e.target.value)}
              placeholder="z.B. 5"
              min="1"
              max="18"
            />
          </div>

          <div className="form-group">
            <label htmlFor="profile-vocabulary">Wortschatz-Stufe</label>
            <select
              id="profile-vocabulary"
              value={newProfileVocabulary}
              onChange={(event) => setNewProfileVocabulary(event.target.value as MetacomVocabularySet)}
            >
              {vocabularyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>


          <div className="form-group">
            <label>Avatar wählen</label>
            <div className="avatar-selector">
              {avatarOptions.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`avatar-option ${newProfileAvatar === emoji ? 'selected' : ''}`}
                  onClick={() => setNewProfileAvatar(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="form-actions">
            {profiles.length > 0 && (
              <button
                type="button"
                className="ghost"
                onClick={() => setShowCreateForm(false)}
              >
                Abbrechen
              </button>
            )}
            <button
              type="button"
              className="primary"
              onClick={handleCreateProfile}
            >
              Profil erstellen
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card profile-manager">
      <div className="profile-manager-header">
        <h2>Wer nutzt Amy's Echo gerade?</h2>
        <p className="muted">
          Wähle das passende Profil oder erstelle ein neues für ein weiteres Kind.
        </p>
      </div>

      <div className="profile-grid">
        {profiles.map((profile) => (
          <div
            key={profile.uuid}
            className={`profile-card ${activeProfile?.uuid === profile.uuid ? 'active' : ''}`}
          >
            <button
              type="button"
              className="profile-card-button"
              onClick={() => handleSelectProfile(profile)}
            >
              <div className="profile-avatar">{profile.metadata.avatar || '👤'}</div>
              <div className="profile-info">
                <div className="profile-name">{profile.displayName}</div>
                {profile.metadata.childAge && (
                  <div className="profile-age">{profile.metadata.childAge} Jahre</div>
                )}
              </div>
              {activeProfile?.uuid === profile.uuid && (
                <div className="profile-badge">Aktiv</div>
              )}
            </button>
            <button
              type="button"
              className="profile-delete"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteProfile(profile);
              }}
              aria-label={`Profil ${profile.displayName} löschen`}
            >
              🗑️
            </button>
          </div>
        ))}

        <div className="profile-card profile-card-add">
          <button
            type="button"
            className="profile-card-button"
            onClick={() => setShowCreateForm(true)}
          >
            <div className="profile-avatar">➕</div>
            <div className="profile-info">
              <div className="profile-name">Neues Profil</div>
            </div>
          </button>
        </div>
      </div>

      {activeProfile && (
        <div className="profile-actions">
          <Link to="/" className="primary-button">
            Weiter als {activeProfile.displayName}
          </Link>
        </div>
      )}

      <div className="profile-security-notice">
        <p className="muted small">
          🔒 <strong>Geschützt:</strong> Jedes Profil hat eine eigene eindeutige ID und ist 
          kryptografisch gesichert. Die Trainingsdaten, Modelle und der Fortschritt jedes Kindes 
          bleiben vollständig getrennt und geschützt.
        </p>
      </div>
    </section>
  );
}
