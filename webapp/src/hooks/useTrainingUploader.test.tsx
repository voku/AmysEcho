import 'fake-indexeddb/auto';
import { waitFor } from '@testing-library/dom';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useTrainingUploader } from './useTrainingUploader';
import {
  clearBundleStoreForTests,
  enqueuePersistedBundle,
  listQueuedBundles,
  markBundleFailed,
} from '../training/trainingQueue';
import type { TrainingBundlePayload } from '../training/types';
import { SESSION_EXPIRED_MESSAGE } from '../utils/http';

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
  beforeEach(async () => {
    await clearBundleStoreForTests();
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('liefert Ergebnis nach erfolgreichem Upload', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'bundle-42', status: 'queued', trainingJob: { jobId: 'job-7', status: 'completed' } }),
    });
    (globalThis as any).fetch = fetchSpy;

    const { result } = renderHook(() => useTrainingUploader({ retryDelayMs: 500, maxRetryDelayMs: 500 }));
    await act(async () => {
      await result.current.upload(payload, { endpoint: 'https://example.invalid' });
    });

    expect(result.current.lastResult?.id).toBe('bundle-42');
    expect(result.current.lastResult?.trainingJob?.jobId).toBe('job-7');
    expect(result.current.state).toBe('success');
  });

  it('versucht Upload nach Token-Refresh erneut bei 401', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'bundle-401', status: 'queued' }) });
    (globalThis as any).fetch = fetchSpy;
    const refreshMock = vi.fn().mockResolvedValue('new-token');

    const { result } = renderHook(() =>
      useTrainingUploader({
        defaultOptions: { endpoint: 'https://example.invalid', token: 'old-token', refreshAccessToken: refreshMock },
      }),
    );

    await act(async () => {
      await result.current.upload(payload);
    });

    expect(refreshMock).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect((fetchSpy.mock.calls[1]?.[1] as RequestInit)?.headers).toMatchObject({ Authorization: 'Bearer new-token' });
    expect(result.current.state).toBe('success');
  });

  it('meldet abgelaufene Sitzung, wenn Refresh fehlschlägt', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    (globalThis as any).fetch = fetchSpy;
    const refreshMock = vi.fn().mockResolvedValue(null);

    const { result } = renderHook(() =>
      useTrainingUploader({
        defaultOptions: { endpoint: 'https://example.invalid', token: 'expired-token', refreshAccessToken: refreshMock },
      }),
    );

    await act(async () => {
      const uploadResult = await result.current.upload(payload);
      expect(uploadResult).toBeNull();
    });

    await waitFor(() => {
      expect(result.current.error).toContain(SESSION_EXPIRED_MESSAGE);
      expect(result.current.state).toBe('error');
    });
    await waitFor(async () => {
      const queued = await listQueuedBundles();
      expect(queued.length).toBe(0);
    });
  });


  it('legt fehlgeschlagene Uploads in die Warteschlange', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    (globalThis as any).fetch = fetchSpy;

    const { result } = renderHook(() =>
      useTrainingUploader({ defaultOptions: { endpoint: 'https://example.invalid' } }),
    );
    await act(async () => {
      const uploadResult = await result.current.upload(payload, { endpoint: 'https://example.invalid' });
      expect(uploadResult).toBeNull();
    });
    await waitFor(() => {
      expect(result.current.state).toBe('queued');
      expect(result.current.error).toMatch(/gespeichert/);
    });
    await waitFor(async () => {
      const queued = await listQueuedBundles();
      expect(queued.length).toBe(1);
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

  it('versucht fehlgeschlagene Bundles im Hintergrund erneut zu synchronisieren', async () => {
    await enqueuePersistedBundle({
      profileId: 'demo',
      label: 'HILFE',
      capturedAt: '2024-01-01T00:00:00.000Z',
      source: 'web://mediapipe',
      framesCount: 1,
      zip: new TextEncoder().encode('demo-zip'),
    });

    type FetchResponse = { ok: true; status: number; json: () => Promise<{ id: string }> };
    let resolveSecondFetch: ((value: FetchResponse) => void) | undefined;
    const secondResponse = new Promise<FetchResponse>((resolve) => {
      resolveSecondFetch = resolve;
    });

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockImplementationOnce(() => secondResponse);
    (globalThis as any).fetch = fetchSpy;

    const { result } = renderHook(() =>
      useTrainingUploader({
        retryDelayMs: 10,
        maxRetryDelayMs: 20,
        defaultOptions: { endpoint: 'https://example.invalid' },
      }),
    );

    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(0));

    resolveSecondFetch?.({ ok: true, status: 200, json: async () => ({ id: 'bundle-retry' }) });

    await act(async () => {
      await result.current.syncQueued();
    });

    await waitFor(async () => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.current.syncError).toBeNull();
      const remaining = await listQueuedBundles();
      expect(remaining.length).toBe(0);
    }, { timeout: 3000 });
  }, 5000);

  it('überspringt Auth-fehlgeschlagene Bundles ohne Token weiterhin bei der Synchronisierung', async () => {
    const stored = await enqueuePersistedBundle({
      profileId: 'demo',
      label: 'HILFE',
      capturedAt: '2024-01-01T00:00:00.000Z',
      source: 'web://mediapipe',
      framesCount: 1,
      zip: new TextEncoder().encode('demo-zip'),
    });
    expect(stored).not.toBeNull();
    if (!stored) return;

    await markBundleFailed(stored.key, SESSION_EXPIRED_MESSAGE);

    const fetchSpy = vi.fn();
    (globalThis as any).fetch = fetchSpy;

    const { result } = renderHook(() =>
      useTrainingUploader({ defaultOptions: { endpoint: 'https://example.invalid' } }),
    );

    await waitFor(() => {
      expect(result.current.queuedBundles.length).toBe(1);
      expect(result.current.queuedBundles[0]?.status).toBe('failed');
    });

    let resultSync!: { uploaded: number; remaining: number; blocked: number };
    await act(async () => {
      resultSync = await result.current.syncQueued();
    });

    expect(resultSync.uploaded).toBe(0);
    expect(resultSync.remaining).toBe(1);
    expect(resultSync.blocked).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });



  it('listet gespeicherte Bundles und erlaubt das Löschen', async () => {
    const stored = await enqueuePersistedBundle({
      profileId: 'demo',
      label: 'HILFE',
      capturedAt: '2024-01-01T00:00:00.000Z',
      source: 'web://mediapipe',
      framesCount: 1,
      zip: new TextEncoder().encode('demo-zip'),
    });
    expect(stored).not.toBeNull();
    if (!stored) return;

    const { result } = renderHook(() => useTrainingUploader());

    await waitFor(() => expect(result.current.queuedBundles.length).toBe(1));
    expect(result.current.queuedBundles[0]).toMatchObject({ key: stored.key, profileId: 'demo' });

    await act(async () => {
      await result.current.removeBundle(stored.key);
    });

    await waitFor(() => expect(result.current.queuedBundles.length).toBe(0));
  });

  it('synchronisiert ein einzelnes gespeichertes Bundle erneut', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const stored = await enqueuePersistedBundle({
      profileId: 'demo',
      label: 'HILFE',
      capturedAt: '2024-01-01T00:00:00.000Z',
      source: 'web://mediapipe',
      framesCount: 1,
      zip: new TextEncoder().encode('demo-zip'),
    });
    expect(stored).not.toBeNull();
    if (!stored) return;

    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'bundle-resend' }) });
    (globalThis as any).fetch = fetchSpy;

    const { result } = renderHook(() => useTrainingUploader());

    await waitFor(() => expect(result.current.queuedBundles.length).toBe(1));

    await act(async () => {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
      const synced = await result.current.syncBundle(stored.key, { endpoint: 'https://example.invalid' });
      expect(synced).toBe(true);
    });

    await waitFor(() => expect(result.current.queuedBundles.length).toBe(0));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
