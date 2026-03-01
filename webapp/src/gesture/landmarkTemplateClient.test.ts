import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchLandmarkTemplates, onTemplatesUpdated } from './landmarkTemplateClient';

describe('fetchLandmarkTemplates', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('gibt Vorlagen für ein gültiges Profil zurück', async () => {
    const templates = [
      { id: 'tpl_1', label: 'hilfe', profileId: 'amy', landmarks: [], handedness: 'right', createdAt: '2024-01-01' },
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ templates }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock as any);

    const result = await fetchLandmarkTemplates({
      endpoint: 'https://api.example.com/api/v1/landmarks/templates',
      profileId: 'amy',
      token: 'abc',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result![0].label).toBe('hilfe');
  });

  it('sendet Authorization-Header mit Token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ templates: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock as any);

    await fetchLandmarkTemplates({
      endpoint: 'https://api.example.com/api/v1/landmarks/templates',
      token: 'my-token',
      profileId: 'amy',
    });

    const [, options] = fetchMock.mock.calls[0] ?? [];
    expect(options.headers.Authorization).toBe('Bearer my-token');
  });

  it('gibt leeres Array zurück, wenn profileId leer ist', async () => {
    const result = await fetchLandmarkTemplates({
      endpoint: 'https://api.example.com/api/v1/landmarks/templates',
      profileId: '  ',
    });
    expect(result).toEqual([]);
  });

  it('gibt null zurück bei ungültiger URL', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await fetchLandmarkTemplates({
      endpoint: 'not-a-url',
      profileId: 'amy',
    });
    expect(result).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[Templates] Ungültige Endpoint-URL',
      expect.anything(),
    );
    consoleWarnSpy.mockRestore();
  });

  it('gibt null zurück bei Serverfehler', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('error', { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock as any);

    const result = await fetchLandmarkTemplates({
      endpoint: 'https://api.example.com/api/v1/landmarks/templates',
      profileId: 'amy',
    });

    expect(result).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('gibt null zurück bei Netzwerkfehler', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock as any);

    const result = await fetchLandmarkTemplates({
      endpoint: 'https://api.example.com/api/v1/landmarks/templates',
      profileId: 'amy',
    });

    expect(result).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('ruft Listener bei erfolgreichem Laden auf', async () => {
    const templates = [{ id: 't1', label: 'a', profileId: 'amy', landmarks: [], handedness: 'right', createdAt: '' }];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ templates }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock as any);

    const listener = vi.fn();
    const unsub = onTemplatesUpdated(listener);

    await fetchLandmarkTemplates({
      endpoint: 'https://api.example.com/api/v1/landmarks/templates',
      profileId: 'amy',
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(templates);

    unsub();
  });

  it('erlaubt Abmelden von Listener', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ templates: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock as any);

    const listener = vi.fn();
    const unsub = onTemplatesUpdated(listener);
    unsub();

    await fetchLandmarkTemplates({
      endpoint: 'https://api.example.com/api/v1/landmarks/templates',
      profileId: 'amy',
    });

    expect(listener).not.toHaveBeenCalled();
  });
});
