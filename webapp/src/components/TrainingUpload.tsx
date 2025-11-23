import { FormEvent, useCallback, useMemo, useState } from 'react';
import { useTrainingUploader } from '../hooks/useTrainingUploader';
import { frameHasAnyLandmarks } from '../training/handUtils';
import type { TrainingFrame } from '../training/types';

function parseFrames(raw: unknown): TrainingFrame[] {
  const frames = Array.isArray((raw as { frames?: unknown }).frames)
    ? (raw as { frames: unknown[] }).frames
    : Array.isArray(raw)
    ? (raw as unknown[])
    : [];

  const collected: TrainingFrame[] = [];
  frames.forEach((entry) => {
    if (entry && typeof entry === 'object' && 'landmarks' in (entry as Record<string, unknown>)) {
      const candidate = entry as { landmarks?: unknown; handedness?: unknown };
      const landmarks = Array.isArray(candidate.landmarks) ? candidate.landmarks : [];
      const handedness = Array.isArray(candidate.handedness)
        ? candidate.handedness.filter((h) => typeof h === 'string')
        : [];
      collected.push({ landmarks: landmarks as number[][][], handedness });
      return;
    }
    if (Array.isArray(entry)) {
      collected.push({ landmarks: entry as number[][][] });
    }
  });

  return collected.filter((frame) => frameHasAnyLandmarks(frame.landmarks));
}

export function TrainingUpload() {
  const [profileId, setProfileId] = useState('web-demo');
  const [label, setLabel] = useState('HILFE');
  const [capturedAt, setCapturedAt] = useState(() => new Date().toISOString());
  const [frames, setFrames] = useState<TrainingFrame[]>([]);
  const [framesFileName, setFramesFileName] = useState<string>('');
  const [clipFile, setClipFile] = useState<File | null>(null);
  const [stillFile, setStillFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string>('');
  const { upload, state, lastResult, error } = useTrainingUploader();

  const frameSummary = useMemo(() => {
    if (frames.length === 0) return 'Keine verwertbaren Frames geladen.';
    return `${frames.length} Frames mit Landmarken geladen`;
  }, [frames]);

  const handleFramesFile = useCallback(async (file: File | null) => {
    if (!file) {
      setFrames([]);
      setFramesFileName('');
      return;
    }
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      setMessage('JSON konnte nicht gelesen werden.');
      setFrames([]);
      setFramesFileName(file.name);
      return;
    }
    const nextFrames = parseFrames(parsed);
    setFrames(nextFrames);
    setFramesFileName(file.name);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (frames.length === 0) {
        setMessage('Bitte lade zuerst Landmark-Daten hoch.');
        return;
      }
      setMessage('Paket wird erstellt und hochgeladen…');
      try {
        await upload({
          profileId,
          label,
          frames,
          capturedAt,
          source: 'web://mediapipe',
          clipFile,
          stillFile,
        });
        setMessage('Upload abgeschlossen. Vielen Dank für die neuen Trainingsdaten!');
      } catch (uploadError) {
        const reason = uploadError instanceof Error ? uploadError.message : String(uploadError);
        setMessage(`Upload fehlgeschlagen: ${reason}`);
      }
    },
    [capturedAt, clipFile, frames, label, profileId, stillFile, upload],
  );

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Training</p>
          <h2>Gestenpaket hochladen</h2>
          <p className="muted">
            Lädt ein ZIP-Paket nach dem App-Vorbild hoch ({'metadata.json'}, {'landmarks.json'}, optional Video/Standbild).
            Ideal für Test-Bundles oder QA im Browser.
          </p>
        </div>
        <div className="status-chip" data-state={state === 'error' ? 'error' : 'running'}>
          {state === 'success'
            ? 'Upload erfolgreich'
            : state === 'error'
            ? 'Fehler beim Upload'
            : state === 'uploading'
            ? 'Upload läuft…'
            : state === 'preparing'
            ? 'Paket wird erstellt…'
            : 'Bereit'}
        </div>
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="profile">Profil-ID</label>
          <input
            id="profile"
            value={profileId}
            onChange={(event) => setProfileId(event.target.value)}
            required
          />
          <p className="muted small">Verknüpft das Bundle mit einem Profil (z. B. aus dem Server-Dataset).</p>
        </div>
        <div className="form-group">
          <label htmlFor="label">Gestenlabel</label>
          <input id="label" value={label} onChange={(event) => setLabel(event.target.value)} required />
          <p className="muted small">Muss einem bekannten Gestenbegriff entsprechen (z. B. „HILFE“).</p>
        </div>
        <div className="form-group">
          <label htmlFor="captured">Aufnahmedatum</label>
          <input id="captured" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} />
          <p className="muted small">ISO-8601, wird sonst automatisch gesetzt.</p>
        </div>

        <div className="training-grid">
          <div className="panel">
            <p className="eyebrow">Landmarks</p>
            <p className="muted">
              Erwartet ein JSON mit Array an Frames oder ein Objekt mit <code>{'{ frames: [] }'}</code>.
            </p>
            <div className="file-input">
              <input
                type="file"
                accept="application/json"
                onChange={(event) => handleFramesFile(event.target.files?.[0] ?? null)}
              />
              <p className="muted small">{framesFileName || 'Noch keine Datei gewählt'}</p>
            </div>
            <p className="value">{frameSummary}</p>
          </div>

          <div className="panel">
            <p className="eyebrow">Video (optional)</p>
            <div className="file-input">
              <input type="file" accept="video/*" onChange={(event) => setClipFile(event.target.files?.[0] ?? null)} />
              <p className="muted small">{clipFile?.name || 'Kein Clip ausgewählt'}</p>
            </div>
            <p className="eyebrow" style={{ marginTop: '1rem' }}>
              Standbild (optional)
            </p>
            <div className="file-input">
              <input type="file" accept="image/*" onChange={(event) => setStillFile(event.target.files?.[0] ?? null)} />
              <p className="muted small">{stillFile?.name || 'Kein Standbild ausgewählt'}</p>
            </div>
          </div>

          <div className="panel">
            <p className="eyebrow">Status & Hinweise</p>
            {message && <div className="notice info">{message}</div>}
            {error && <div className="notice error">{error}</div>}
            <ul className="muted small bullets">
              <li>Kein Offline-Queueing – der Browser lädt direkt hoch.</li>
              <li>Die ZIP-Struktur entspricht dem App-Bundle ({'metadata.json'}, {'landmarks.json'}, optional Dateien).</li>
              <li>API-Endpunkt wird über <code>VITE_API_URL</code> konfiguriert.</li>
            </ul>
            <button className="primary" type="submit" disabled={frames.length === 0 || state === 'uploading'}>
              Trainingspaket hochladen
            </button>
          </div>
        </div>
      </form>

      {lastResult && (
        <div className="result-card">
          <div>
            <p className="eyebrow">Server-Antwort</p>
            <p className="value">Bundle-ID: {lastResult.id}</p>
            <p className="muted">Status: {lastResult.status}</p>
          </div>
          {lastResult.trainingJob && (
            <div>
              <p className="eyebrow">Trainingsjob</p>
              <p className="value">Job-ID: {lastResult.trainingJob.jobId}</p>
              <p className="muted">
                {lastResult.trainingJob.status}
                {lastResult.trainingJob.pollUrl ? ` · ${lastResult.trainingJob.pollUrl}` : ''}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
