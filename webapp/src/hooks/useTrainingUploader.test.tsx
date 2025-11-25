import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useTrainingUploader } from './useTrainingUploader';
import { BUNDLE_KEY_PREFIX, listQueuedBundles } from '../training/trainingQueue';
import type { TrainingBundlePayload } from '../training/types';

const payload: TrainingBundlePayload = {
  profileId: 'demo',
  label: 'HILFE',
  frames: [
    {
      landmarks: [
        [
          [0, 0, 0],
        ],
        [],
      ],
    },
  ],
};

describe('useTrainingUploader', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    vi.restoreAllMocks();
  });

  it('liefert Ergebnis nach erfolgreichem Upload', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'bundle-42', status: 'queued', trainingJob: { jobId: 'job-7', status: 'completed' } }),
    });
    (globalThis as any).fetch = fetchSpy;

    const { result } = renderHook(() => useTrainingUploader());
    await act(async () => {
      await result.current.upload(payload, { endpoint: 'https://example.invalid' });
    });

    expect(result.current.lastResult?.id).toBe('bundle-42');
    expect(result.current.lastResult?.trainingJob?.jobId).toBe('job-7');
    expect(result.current.state).toBe('success');
  });

  it('verwendet Default-Optionen für Uploads und Polling', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'bundle-12',
          status: 'queued',
          trainingJob: { jobId: 'job-12', status: 'running', pollUrl: '/jobs/12' },
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'completed' }) });
    (globalThis as any).fetch = fetchSpy;

    const { result } = renderHook(() =>
      useTrainingUploader({
        defaultOptions: { endpoint: 'https://api.example.com/api/v1/dgs/sample-bundles', apiBase: 'https://api.example.com' },
        pollIntervalMs: 5,
      }),
    );

    await act(async () => {
      await result.current.upload(payload);
    });

    await waitFor(() => {
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.example.com/api/v1/dgs/sample-bundles');
      expect(fetchSpy.mock.calls.some((call) => String(call?.[0]).includes('/jobs/12'))).toBe(true);
    });
  });

  it('legt fehlgeschlagene Uploads in die Warteschlange', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    (globalThis as any).fetch = fetchSpy;

    const { result } = renderHook(() => useTrainingUploader());
    await act(async () => {
      const uploadResult = await result.current.upload(payload, { endpoint: 'https://example.invalid' });
      expect(uploadResult).toBeNull();
    });
    const queued = await listQueuedBundles();
    expect(queued.length).toBe(1);
    expect(result.current.state).toBe('queued');
    expect(result.current.error).toMatch(/gespeichert/);
  });

  it('legt Bundles offline ab und synchronisiert sie manuell', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const { result } = renderHook(() => useTrainingUploader());

    await act(async () => {
      await result.current.upload(payload, { endpoint: 'https://offline.invalid' });
    });

    expect(result.current.state).toBe('queued');
    const queuedAfter = await listQueuedBundles();
    expect(queuedAfter.length).toBe(1);

    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'bundle-99' }) });
    (globalThis as any).fetch = fetchSpy;

    await act(async () => {
      const uploaded = await result.current.syncQueued({ endpoint: 'https://example.invalid' });
      expect(uploaded).toBe(1);
    });

    const queuedAfterSync = await listQueuedBundles();
    expect(queuedAfterSync.length).toBe(0);
  });

  it('synchronisiert gespeicherte Bundles automatisch, wenn online', async () => {
    const base64 = btoa('demo-zip');
    window.localStorage.setItem(
      `${BUNDLE_KEY_PREFIX}demo:auto`,
      JSON.stringify({
        key: `${BUNDLE_KEY_PREFIX}demo:auto`,
        profileId: 'demo',
        label: 'HILFE',
        capturedAt: '2024-01-01T00:00:00.000Z',
        source: 'web://mediapipe',
        queuedAt: '2024-01-01T00:00:00.000Z',
        framesCount: 1,
        zipBase64: base64,
        status: 'pending',
        attempts: 0,
      }),
    );

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'bundle-auto' }),
    });
    (globalThis as any).fetch = fetchSpy;

    const { result } = renderHook(() => useTrainingUploader());

    await waitFor(async () => {
      expect(fetchSpy).toHaveBeenCalled();
      expect(result.current.syncing).toBe(false);
      const remaining = await listQueuedBundles();
      expect(remaining.length).toBe(0);
    });
  });

  it('pollt den Trainingsjob bis zum Abschluss', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'bundle-42',
          status: 'queued',
          trainingJob: { jobId: 'job-7', status: 'running', pollUrl: 'https://example.invalid/jobs/7' },
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'running' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'completed' }) });
    (globalThis as any).fetch = fetchSpy;

    const { result } = renderHook(() => useTrainingUploader({ pollIntervalMs: 10 }));
    await act(async () => {
      await result.current.upload(payload, { endpoint: 'https://example.invalid' });
    });

    expect(result.current.trainingJob?.status).toBeDefined();

    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(3));

    await waitFor(() => expect(result.current.trainingJob?.status).toBe('completed'));
  });

  it('meldet Polling-Fehler des Trainingsjobs', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'bundle-101',
          status: 'queued',
          trainingJob: { jobId: 'job-9', status: 'running', pollUrl: 'https://example.invalid/jobs/9' },
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    (globalThis as any).fetch = fetchSpy;

    const { result } = renderHook(() => useTrainingUploader({ pollIntervalMs: 10 }));
    await act(async () => {
      await result.current.upload(payload, { endpoint: 'https://example.invalid' });
    });

    await waitFor(() => expect(result.current.trainingJobError).toMatch(/Polling/));
  });
});
