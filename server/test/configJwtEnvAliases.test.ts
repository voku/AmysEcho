describe('config JWT environment variables', () => {
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

  it('requires canonical JWT env names and ignores removed legacy aliases', async () => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    process.env.JWT_ACCESS_SECRET = 'legacy-jwt-secret';
    process.env.JWT_REFRESH_TOKEN_SECRET = 'legacy-refresh-secret';

    await expect(import('../src/config/index.js')).rejects.toThrow(
      'Environment variable JWT_SECRET is required',
    );
  });

  it('throws when required JWT secret is missing', async () => {
    process.env.JWT_REFRESH_SECRET = 'some-refresh-secret';
    delete process.env.JWT_SECRET;
    delete process.env.JWT_ACCESS_SECRET;

    await expect(import('../src/config/index.js')).rejects.toThrow(
      'Environment variable JWT_SECRET is required',
    );
  });
});
