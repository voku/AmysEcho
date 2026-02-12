import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiConfig } from '../hooks/useApiConfig';
import { resolveApiUrl } from '../utils/resolveApiUrl';
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

/** Unified video item for both recorded and reference videos */
interface GalleryVideoItem {
  id: string;
  label: string;
  clipUrl: string;
  stillUrl: string | null;
  capturedAt: string | null;
  clipDurationMs: number | null;
  source: 'recorded' | 'reference';
}

interface VideosByLabel {
  label: string;
  videos: GalleryVideoItem[];
}

function toGalleryItem(v: TrainingVideoItem): GalleryVideoItem {
  return {
    id: v.bundleId,
    label: v.label,
    clipUrl: v.clipUrl,
    stillUrl: v.stillUrl,
    capturedAt: v.capturedAt,
    clipDurationMs: v.clipDurationMs,
    source: 'recorded',
  };
}

export function SignVideoGallery() {
  const { profileId } = useAppState();
  const { apiBaseUrl } = useApiConfig();
  const [recordedVideos, setRecordedVideos] = useState<GalleryVideoItem[]>([]);
  const [referenceVideos, setReferenceVideos] = useState<GalleryVideoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<GalleryVideoItem | null>(null);
  const [filterLabel, setFilterLabel] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'recorded' | 'reference'>('all');

  const loadVideos = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const promises: Promise<void>[] = [];

      // Load user-recorded training videos (requires profile).
      // Clears previous recordings when no profile is active to prevent privacy leak.
      if (profileId) {
        promises.push(
          apiRetryManager
            .fetch(resolveApiUrl(`/api/v1/profiles/${profileId}/training-videos`, apiBaseUrl))
            .then(async (res) => {
              if (res.ok) {
                const data = await res.json();
                setRecordedVideos((data.videos ?? []).map(toGalleryItem));
              } else {
                setRecordedVideos([]);
              }
            }),
        );
      } else {
        setRecordedVideos([]);
      }

      // Load DGS reference videos (not profile-specific)
      promises.push(
        apiRetryManager
          .fetch(resolveApiUrl('/api/v1/dgs-videos', apiBaseUrl))
          .then(async (res) => {
            if (res.ok) {
              const data = await res.json();
              const refs: GalleryVideoItem[] = (data.videos ?? []).map(
                (v: { label: string; filename: string; clipUrl: string }) => ({
                  id: `ref-${v.filename}`,
                  label: v.label,
                  clipUrl: v.clipUrl,
                  stillUrl: null,
                  capturedAt: null,
                  clipDurationMs: null,
                  source: 'reference' as const,
                }),
              );
              setReferenceVideos(refs);
            }
          }),
      );

      await Promise.all(promises);
    } catch (err) {
      console.warn('[SignVideoGallery] Failed to load videos:', err);
      setError('Videos konnten nicht geladen werden.');
    } finally {
      setIsLoading(false);
    }
  }, [profileId, apiBaseUrl]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // Combine and filter videos by active tab
  const allVideos = useMemo((): GalleryVideoItem[] => {
    if (activeTab === 'recorded') return recordedVideos;
    if (activeTab === 'reference') return referenceVideos;
    return [...recordedVideos, ...referenceVideos];
  }, [recordedVideos, referenceVideos, activeTab]);

  // Group videos by label
  const videosByLabel = useMemo((): VideosByLabel[] => {
    const map = new Map<string, GalleryVideoItem[]>();
    for (const video of allVideos) {
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
  }, [allVideos]);

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

  // Selected video player modal
  if (selectedVideo) {
    const sourceLabel = selectedVideo.source === 'reference'
      ? 'Referenzvideo'
      : 'Eigene Aufnahme';
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
          <span className={`badge ${selectedVideo.source === 'reference' ? 'badge-ref' : 'badge-rec'}`}>
            {sourceLabel}
          </span>
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
            Schau dir Gebärdenvideos an, um durch Zuschauen zu lernen –
            sowohl Referenzvideos als auch deine eigenen Aufnahmen!
          </p>
        </div>
      </div>

      {/* Source tabs */}
      <div className="sign-video-tabs" role="tablist" aria-label="Videoquelle wählen">
        <button
          role="tab"
          aria-selected={activeTab === 'all'}
          className={`sign-video-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          Alle ({recordedVideos.length + referenceVideos.length})
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'reference'}
          className={`sign-video-tab ${activeTab === 'reference' ? 'active' : ''}`}
          onClick={() => setActiveTab('reference')}
        >
          📚 Referenzvideos ({referenceVideos.length})
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'recorded'}
          className={`sign-video-tab ${activeTab === 'recorded' ? 'active' : ''}`}
          onClick={() => setActiveTab('recorded')}
        >
          🎥 Eigene Aufnahmen ({recordedVideos.length})
        </button>
      </div>

      {error && (
        <div className="notice warning">
          <p>{error}</p>
          <button className="secondary-button" onClick={loadVideos}>
            Erneut versuchen
          </button>
        </div>
      )}

      {allVideos.length === 0 && !error && (
        <div className="notice info">
          <p>
            {activeTab === 'recorded'
              ? <>Noch keine eigenen Aufnahmen. Gehe zum{' '}<Link to="/lernen">Lernbereich</Link>, um Gebärden aufzunehmen!</>
              : 'Keine Videos in dieser Kategorie verfügbar.'}
          </p>
        </div>
      )}

      {allVideos.length > 0 && (
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
                      key={video.id}
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
                          <span>{video.source === 'reference' ? '📚' : '🤟'}</span>
                        </div>
                      )}
                      <span className="sign-video-card-label">
                        ▶ {video.label}
                      </span>
                      <span className={`sign-video-card-source ${video.source === 'reference' ? 'badge-ref' : 'badge-rec'}`}>
                        {video.source === 'reference' ? 'Referenz' : 'Aufnahme'}
                      </span>
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
