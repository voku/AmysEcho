describe('config JWT env aliases', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('uses canonical JWT env names when present', async () => {
    process.env.JWT_SECRET = 'primary-jwt-secret';
    process.env.JWT_REFRESH_SECRET = 'primary-refresh-secret';

    const { config } = await import('../src/config/index.js');

    expect(config.jwtSecret).toBe('primary-jwt-secret');
    expect(config.jwtRefreshSecret).toBe('primary-refresh-secret');
  });

  it('falls back to legacy JWT alias names with warning', async () => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    process.env.JWT_ACCESS_SECRET = 'legacy-jwt-secret';
    process.env.JWT_REFRESH_TOKEN_SECRET = 'legacy-refresh-secret';

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { config } = await import('../src/config/index.js');

    expect(config.jwtSecret).toBe('legacy-jwt-secret');
    expect(config.jwtRefreshSecret).toBe('legacy-refresh-secret');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('JWT_ACCESS_SECRET is deprecated'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('JWT_REFRESH_TOKEN_SECRET is deprecated'),
    );
  });
});
