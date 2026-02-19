describe('config rate limit defaults', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('uses relaxed default limits for authenticated API flows', async () => {
    process.env.JWT_SECRET = 'jwt-secret';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret';
    process.env.BACKUP_SECRET = 'backup-secret';
    delete process.env.API_LIMIT;
    delete process.env.MODEL_METADATA_LIMIT;
    delete process.env.TRAINING_LIMIT;
    delete process.env.MODEL_DOWNLOAD_LIMIT;
    delete process.env.TRAINING_MANIFEST_CACHE_TTL_MS;

    const { config } = await import('../src/config/index.js');

    expect(config.apiLimit).toBe(1000);
    expect(config.modelMetadataLimit).toBe(300);
    expect(config.trainingLimit).toBe(120);
    expect(config.modelDownloadLimit).toBe(120);
    expect(config.trainingManifestCacheTtlMs).toBe(30_000);
  });
});
