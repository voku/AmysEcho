import { gdprService } from '../src/services/gdprService';

describe('gdprService', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });

  it('exports profile data', async () => {
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ profile: { id: 'p1' }, usageStats: [], corrections: [] }),
    });
    const data = await gdprService.exportProfile('p1');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/profiles/p1/export'),
      expect.any(Object),
    );
    expect(data?.profile.id).toBe('p1');
  });

  it('deletes profile', async () => {
    (global as any).fetch.mockResolvedValue({ ok: true });
    const ok = await gdprService.deleteProfile('p2');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/profiles/p2'),
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(ok).toBe(true);
  });

  it('handles failures', async () => {
    (global as any).fetch.mockResolvedValue({ ok: false, status: 500 });
    const ok = await gdprService.deleteProfile('p3');
    expect(ok).toBe(false);
  });
});
