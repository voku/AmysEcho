import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiConfig } from '../hooks/useApiConfig';
import { useAppState } from '../hooks/useAppState';
import { apiRetryManager } from '../services/apiRetryManager';
import { DgsVideoPlayer } from './DgsVideoPlayer';

interface TrainingVideoItem {
  bundleId: string;
  label: string;
  symbolId?: string;
  capturedAt: string | null;
  clipUrl: string;
  stillUrl: string | null;
  clipDurationMs: number | null;
  clipMimeType: string | null;
}

interface VideosByLabel {
  label: string;
  videos: TrainingVideoItem[];
}

export function SignVideoGallery() {
  const { profileId } = useAppState();
  const { apiBaseUrl } = useApiConfig();
  const [videos, setVideos] = useState<TrainingVideoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<TrainingVideoItem | null>(null);
  const [filterLabel, setFilterLabel] = useState<string>('');

  const loadVideos = useCallback(async () => {
    if (!profileId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiRetryManager.fetch(
        `${apiBaseUrl}/api/v1/profiles/${profileId}/training-videos`,
      );
      if (!response.ok) {
        throw new Error(`Fehler beim Laden: ${response.status}`);
      }
      const data = await response.json();
      setVideos(data.videos ?? []);
    } catch (err) {
      console.warn('[SignVideoGallery] Failed to load videos:', err);
      setError('Trainingsvideos konnten nicht geladen werden.');
    } finally {
      setIsLoading(false);
    }
  }, [profileId, apiBaseUrl]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // Group videos by label
  const videosByLabel = useMemo((): VideosByLabel[] => {
    const map = new Map<string, TrainingVideoItem[]>();
    for (const video of videos) {
      const existing = map.get(video.label);
      if (existing) {
        existing.push(video);
      } else {
        map.set(video.label, [video]);
      }
    }
    return Array.from(map.entries())
      .map(([label, vids]) => ({ label, videos: vids }))
      .sort((a, b) => a.label.localeCompare(b.label, 'de'));
  }, [videos]);

  // Filter by label
  const filteredGroups = useMemo(() => {
    if (!filterLabel) return videosByLabel;
    const lower = filterLabel.toLowerCase();
    return videosByLabel.filter((group) =>
      group.label.toLowerCase().includes(lower),
    );
  }, [videosByLabel, filterLabel]);

  const labels = useMemo(
    () => videosByLabel.map((g) => g.label),
    [videosByLabel],
  );

  if (isLoading) {
    return (
      <section className="card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Gebärdenvideos</p>
            <h2>Wird geladen…</h2>
          </div>
        </div>
      </section>
    );
  }

  if (!profileId) {
    return (
      <section className="card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Gebärdenvideos</p>
            <h2>Kein Profil ausgewählt</h2>
            <p className="muted">
              Bitte wähle ein Profil aus, um die Trainingsvideos zu sehen.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Selected video player modal
  if (selectedVideo) {
    return (
      <section className="card sign-video-gallery">
        <div className="card-header">
          <div>
            <p className="eyebrow">Gebärdenvideos</p>
            <h2>{selectedVideo.label}</h2>
          </div>
          <button
            className="secondary-button"
            onClick={() => setSelectedVideo(null)}
          >
            Zurück zur Übersicht
          </button>
        </div>

        <DgsVideoPlayer
          src={`${apiBaseUrl}${selectedVideo.clipUrl}`}
          title={`Gebärde: ${selectedVideo.label}`}
          {...(selectedVideo.stillUrl
            ? { poster: `${apiBaseUrl}${selectedVideo.stillUrl}` }
            : {})}
          autoPlay
          loop
          muted
        />

        <div className="sign-video-meta">
          {selectedVideo.capturedAt && (
            <span className="muted">
              Aufgenommen: {new Date(selectedVideo.capturedAt).toLocaleDateString('de-DE')}
            </span>
          )}
          {selectedVideo.clipDurationMs != null && (
            <span className="muted">
              Dauer: {(selectedVideo.clipDurationMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>

        <div className="notice info">
          <p>
            Schau dir die Gebärde genau an und versuche sie nachzumachen.
            Du kannst die Geschwindigkeit ändern, um Details besser zu sehen.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="card sign-video-gallery">
      <div className="card-header">
        <div>
          <p className="eyebrow">Gebärdenvideos</p>
          <h2>Gebärden ansehen & lernen</h2>
          <p className="muted">
            Hier siehst du alle aufgenommenen Gebärden. Schau dir die Videos an,
            um die Gebärden zu lernen – nicht nur durch Ausprobieren, sondern auch
            durch Zuschauen!
          </p>
        </div>
      </div>

      {error && (
        <div className="notice warning">
          <p>{error}</p>
          <button className="secondary-button" onClick={loadVideos}>
            Erneut versuchen
          </button>
        </div>
      )}

      {videos.length === 0 && !error && (
        <div className="notice info">
          <p>
            Noch keine Trainingsvideos aufgenommen.
            Gehe zum{' '}
            <Link to="/lernen">Lernbereich</Link>
            , um Gebärden aufzunehmen – dann erscheinen sie hier zum Ansehen!
          </p>
        </div>
      )}

      {videos.length > 0 && (
        <>
          {labels.length > 3 && (
            <div className="sign-video-filter">
              <input
                type="text"
                placeholder="Gebärde suchen…"
                value={filterLabel}
                onChange={(e) => setFilterLabel(e.target.value)}
                className="input"
                aria-label="Gebärden filtern"
              />
            </div>
          )}

          <div className="sign-video-groups">
            {filteredGroups.map((group) => (
              <div key={group.label} className="sign-video-group">
                <h3 className="sign-video-group-label">
                  {group.label}
                  <span className="badge">{group.videos.length}</span>
                </h3>
                <div className="sign-video-grid">
                  {group.videos.map((video) => (
                    <button
                      key={video.bundleId}
                      className="sign-video-card"
                      onClick={() => setSelectedVideo(video)}
                      aria-label={`Video abspielen: ${video.label}`}
                    >
                      {video.stillUrl ? (
                        <img
                          src={`${apiBaseUrl}${video.stillUrl}`}
                          alt={video.label}
                          className="sign-video-thumbnail"
                          loading="lazy"
                        />
                      ) : (
                        <div className="sign-video-thumbnail sign-video-thumbnail-placeholder">
                          <span>🤟</span>
                        </div>
                      )}
                      <span className="sign-video-card-label">
                        ▶ {video.label}
                      </span>
                      {video.capturedAt && (
                        <span className="sign-video-card-date muted">
                          {new Date(video.capturedAt).toLocaleDateString('de-DE')}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {filteredGroups.length === 0 && filterLabel && (
            <div className="notice info">
              <p>Keine Gebärde mit dem Namen „{filterLabel}" gefunden.</p>
            </div>
          )}
        </>
      )}

      <div className="controls">
        <Link to="/lernen" className="secondary-button">
          Zurück zum Lernbereich
        </Link>
      </div>
    </section>
  );
}
